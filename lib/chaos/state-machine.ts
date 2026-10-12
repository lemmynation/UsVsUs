/**
 * Mutation Machine flow (docs/usvsus-4/04-state-machine.md), pure:
 *   STEP_OPEN(1) → … → STEP_OPEN(last) → REVEAL(chain 0) → … → REVEAL(last) → RECAP
 * A step moves on by itself once every assigned job is in; after its timer the
 * host can skip waiting (missing work becomes a placeholder). Each move is a
 * compare-and-swap on state_version in the store.
 */
import type { Assignment, MatchPlan } from "./plan";

export type ChaosPhase = "STEP_OPEN" | "REVEAL" | "RECAP";

export interface ChaosPosition {
  phase: ChaosPhase;
  step: number;
  /** Which chain the reveal is showing (REVEAL only). */
  revealChain: number | null;
}

export type ChaosAction = "auto" | "skip_waiting" | "reveal_next" | "finish";
export type ChaosAdvanceError = "not_ready" | "not_open";

export const firstPosition = (): ChaosPosition => ({ phase: "STEP_OPEN", step: 1, revealChain: null });

export function nextPosition(pos: ChaosPosition, plan: MatchPlan): ChaosPosition {
  const lastStep = plan.steps.length;
  const lastChain = plan.chains.length - 1;
  if (pos.phase === "STEP_OPEN") {
    return pos.step < lastStep
      ? { phase: "STEP_OPEN", step: pos.step + 1, revealChain: null }
      : { phase: "REVEAL", step: lastStep, revealChain: 0 };
  }
  if (pos.phase === "REVEAL" && pos.revealChain !== null && pos.revealChain < lastChain) {
    return { ...pos, revealChain: pos.revealChain + 1 };
  }
  return { phase: "RECAP", step: lastStep, revealChain: null };
}

/** The jobs in a step that still count: work assigned to players who are still in the room. */
export function jobsFor(plan: MatchPlan, step: number, activePlayerIds: Set<string>): Assignment[] {
  return plan.assignments.filter((a) => a.step === step && activePlayerIds.has(a.playerId));
}

export const jobKey = (a: { step: number; chain: number; playerId: string }) => `${a.step}:${a.chain}:${a.playerId}`;

/**
 * Whether `action` may move the match now, and where to. `done` holds jobKeys
 * already submitted for the open step.
 */
export function decideAdvance(input: {
  plan: MatchPlan;
  position: ChaosPosition;
  action: ChaosAction;
  activePlayerIds: Set<string>;
  done: Set<string>;
  deadlinePassed: boolean;
}): { ok: true; next: ChaosPosition } | { ok: false; error: ChaosAdvanceError } {
  const { plan, position, action } = input;
  if (position.phase === "STEP_OPEN") {
    const jobs = jobsFor(plan, position.step, input.activePlayerIds);
    const allIn = jobs.every((j) => input.done.has(jobKey(j)));
    if (action === "auto" && allIn) return { ok: true, next: nextPosition(position, plan) };
    if (action === "skip_waiting" && (allIn || input.deadlinePassed))
      return { ok: true, next: nextPosition(position, plan) };
    return { ok: false, error: action === "auto" || action === "skip_waiting" ? "not_ready" : "not_open" };
  }
  if (position.phase === "REVEAL") {
    if (action === "reveal_next") return { ok: true, next: nextPosition(position, plan) };
    if (action === "finish") return { ok: true, next: { phase: "RECAP", step: position.step, revealChain: null } };
  }
  return { ok: false, error: "not_open" };
}

export const stepDeadline = (plan: MatchPlan, step: number, openedAt: Date): Date =>
  new Date(openedAt.getTime() + (plan.steps.find((s) => s.index === step)?.seconds ?? 0) * 1000);
