/**
 * Mutation Machine scoring (approved decision B, docs/usvsus-4/03-mini-game-rules.md):
 * detectives +2 for the right mutation, +1 for the right original; the step's
 * mutator / the chain's creator +1 for each detective who spotted their part.
 * Never negative. Pure; the service locks a step's entries in once.
 */
import type { MatchPlan } from "./plan";

export type ScoreReason = "detect_mutation" | "detect_object" | "mutation_seen" | "object_seen";

export interface ScoreEntry {
  step: number;
  chain: number;
  playerId: string;
  reason: ScoreReason;
  points: number;
}

export interface DetectAnswer {
  step: number;
  chain: number;
  playerId: string;
  objectId?: string;
  mutationId?: string;
}

/** Which chains had a step's work replaced by a placeholder (nobody submitted). */
export interface Missing {
  /** `${chain}:${step}` for create/mutate steps with no submission. */
  artifacts: Set<string>;
}

const key = (chain: number, step: number) => `${chain}:${step}`;
const POINTS = { detectMutation: 2, detectObject: 1, mutationSeen: 1, objectSeen: 1 } as const;

/** Scores one detect step (3 or 5). Entries are unique per (step, chain, player, reason). */
export function scoreDetectStep(plan: MatchPlan, step: 3 | 5, answers: DetectAnswer[], missing: Missing): ScoreEntry[] {
  const mutateStep = step === 3 ? 2 : 4;
  const round = step === 3 ? 0 : 1;
  const out: ScoreEntry[] = [];
  plan.chains.forEach((chain, c) => {
    // A chain that was never drawn has nothing to detect.
    if (missing.artifacts.has(key(c, 1))) return;
    const mutationVisible = !missing.artifacts.has(key(c, mutateStep));
    const assigned = new Set(
      plan.assignments.filter((a) => a.step === step && a.chain === c && a.role === "detective").map((a) => a.playerId),
    );
    const mutator = plan.assignments.find((a) => a.step === mutateStep && a.chain === c)!.playerId;
    const creator = plan.assignments.find((a) => a.step === 1 && a.chain === c)!.playerId;
    let mutationSpotted = 0;
    let objectSpotted = 0;
    for (const a of answers) {
      if (a.step !== step || a.chain !== c || !assigned.has(a.playerId)) continue;
      if (mutationVisible && a.mutationId === chain.mutationIds[round]) {
        out.push({ step, chain: c, playerId: a.playerId, reason: "detect_mutation", points: POINTS.detectMutation });
        mutationSpotted++;
      }
      if (step === 3 && plan.choices[key(c, 3)]?.objectIds && a.objectId === chain.objectId) {
        out.push({ step, chain: c, playerId: a.playerId, reason: "detect_object", points: POINTS.detectObject });
        objectSpotted++;
      }
    }
    if (mutationSpotted > 0) {
      out.push({
        step,
        chain: c,
        playerId: mutator,
        reason: "mutation_seen",
        points: mutationSpotted * POINTS.mutationSeen,
      });
    }
    if (objectSpotted > 0) {
      out.push({ step, chain: c, playerId: creator, reason: "object_seen", points: objectSpotted * POINTS.objectSeen });
    }
  });
  return out;
}

export function totals(entries: ScoreEntry[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const e of entries) sum[e.playerId] = (sum[e.playerId] ?? 0) + e.points;
  return sum;
}

export type Title = "Sharp Eye" | "Clear Signal" | "Chaos Agent" | "Mind Meld" | "Wildcard";

/** Duo: share of mutation questions the pair got right (0–1), or null if none were asked. */
export function duoSync(plan: MatchPlan, answers: DetectAnswer[], missing: Missing): number | null {
  let asked = 0;
  let right = 0;
  for (const step of [3, 5] as const) {
    const round = step === 3 ? 0 : 1;
    const mutateStep = step === 3 ? 2 : 4;
    plan.chains.forEach((chain, c) => {
      if (missing.artifacts.has(key(c, 1)) || missing.artifacts.has(key(c, mutateStep))) return;
      asked++;
      if (answers.some((a) => a.step === step && a.chain === c && a.mutationId === chain.mutationIds[round])) right++;
    });
  }
  return asked === 0 ? null : right / asked;
}

/**
 * One positive title per player. Earned titles go to the single clear leader
 * (ties share nothing, so nobody is singled out by accident); everyone else is a Wildcard.
 */
export function titlesFor(
  plan: MatchPlan,
  entries: ScoreEntry[],
  answers: DetectAnswer[],
  missing: Missing,
): Record<string, Title> {
  const titles: Record<string, Title> = {};
  if (plan.playerOrder.length === 2) {
    const sync = duoSync(plan, answers, missing);
    for (const id of plan.playerOrder) titles[id] = sync !== null && sync >= 0.75 ? "Mind Meld" : "Wildcard";
    return titles;
  }
  const sumBy = (reasons: ScoreReason[]) => {
    const s = new Map<string, number>();
    for (const e of entries) if (reasons.includes(e.reason)) s.set(e.playerId, (s.get(e.playerId) ?? 0) + e.points);
    return s;
  };
  // Chaos Agent: the mutator whose mutations were missed by the most detectives.
  const missed = new Map<string, number>();
  for (const step of [3, 5] as const) {
    const round = step === 3 ? 0 : 1;
    const mutateStep = step === 3 ? 2 : 4;
    plan.chains.forEach((chain, c) => {
      if (missing.artifacts.has(key(c, 1)) || missing.artifacts.has(key(c, mutateStep))) return;
      const mutator = plan.assignments.find((a) => a.step === mutateStep && a.chain === c)!.playerId;
      const wrong = answers.filter(
        (a) => a.step === step && a.chain === c && a.mutationId && a.mutationId !== chain.mutationIds[round],
      ).length;
      missed.set(mutator, (missed.get(mutator) ?? 0) + wrong);
    });
  }
  const award = (title: Title, scores: Map<string, number>) => {
    const ranked = [...scores].filter(([id, v]) => v > 0 && !titles[id]).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0 || (ranked[1] && ranked[1][1] === ranked[0][1])) return;
    titles[ranked[0][0]] = title;
  };
  award("Sharp Eye", sumBy(["detect_mutation", "detect_object"]));
  award("Clear Signal", sumBy(["object_seen"]));
  award("Chaos Agent", missed);
  for (const id of plan.playerOrder) titles[id] ??= "Wildcard";
  return titles;
}
