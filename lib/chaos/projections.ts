/**
 * What one player may see of a Chain Reactions match (docs/usvsus-4/07). Built
 * field by field for that viewer; anything not listed here never leaves the
 * server. Unrevealed cards, other players' answers and chains you aren't working
 * on stay out until the reveal reaches them.
 */
import type { Artifact } from "./artifact";
import type { ChaosContent } from "./content";
import { choiceKey, type MatchPlan, type StepKind } from "./plan";
import { duoSync, titlesFor, totals, type DetectAnswer, type Missing, type ScoreEntry, type Title } from "./scoring";
import { stepAutoSkipAt, stepDeadline } from "./state-machine";
import type { ChaosContribution, ChaosMatch } from "@/types/chaos";

export interface Choice {
  id: string;
  label: string;
}

/** One layer of a chain: what a creator or mutator made (null = skipped). */
export interface Layer {
  step: number;
  playerId: string;
  artifact: Artifact | null;
}

export type ChaosJob =
  | { kind: "create"; chain: number; object: string; submitted: boolean; mine: Artifact | null }
  | {
      kind: "mutate";
      chain: number;
      /** The chain so far (create, and in round 2 the first mutation). */
      base: Layer[];
      mutation: { label: string; drawHint: string };
      submitted: boolean;
      mine: Artifact | null;
    }
  | {
      kind: "detect";
      chain: number;
      layers: Layer[];
      objectChoices: Choice[] | null;
      mutationChoices: Choice[];
      submitted: boolean;
      mine: { objectId?: string; mutationId?: string } | null;
    };

export interface ChainReveal {
  chain: number;
  object: Choice;
  creatorId: string;
  layers: Layer[];
  mutations: Array<Choice & { mutatorId: string; step: number }>;
  detections: Array<{ step: number; playerId: string; objectRight: boolean | null; mutationRight: boolean | null }>;
}

export interface ChaosPlayerView {
  matchId: string;
  phase: ChaosMatch["phase"];
  stateVersion: number;
  isDuo: boolean;
  /** How many chains the match has (one per player at the start). */
  chainCount: number;
  step: {
    index: number;
    count: number;
    kind: StepKind;
    round: number;
    deadline: string;
    /** When the server moves on without waiting any longer. */
    autoSkipAt: string;
  } | null;
  myJobs: ChaosJob[];
  /** Players who still owe work in this step (ids only, never what they're doing). */
  waitingOn: string[];
  /** Chains revealed so far, in order (REVEAL), or all of them (RECAP). */
  reveals: ChainReveal[];
  /** Index of the chain the reveal is on (REVEAL only). */
  revealChain: number | null;
  recap: { points: Record<string, number>; titles: Record<string, Title>; sync: number | null } | null;
}

const at = (plan: MatchPlan, step: number, chain: number) =>
  plan.assignments.filter((a) => a.step === step && a.chain === chain);

function artifactOf(c: ChaosContribution | undefined): Artifact | null {
  return c?.payload.kind === "artifact" ? c.payload.artifact : null;
}

function find(contributions: ChaosContribution[], step: number, chain: number, playerId?: string) {
  return contributions.find((c) => c.step === step && c.chain === chain && (!playerId || c.playerId === playerId));
}

/** The creator's and mutators' layers of a chain, up to (not including) `beforeStep`. */
function layersOf(plan: MatchPlan, contributions: ChaosContribution[], chain: number, beforeStep: number): Layer[] {
  return [1, 2, 4]
    .filter((step) => step < beforeStep)
    .map((step) => {
      const playerId = at(plan, step, chain)[0].playerId;
      return { step, playerId, artifact: artifactOf(find(contributions, step, chain, playerId)) };
    });
}

/** Which create/mutate jobs ended with nothing submitted (for scoring and placeholders). */
export function missingWork(plan: MatchPlan, contributions: ChaosContribution[], throughStep: number): Missing {
  const artifacts = new Set<string>();
  for (const a of plan.assignments) {
    if (a.step > throughStep || a.role === "detective") continue;
    if (!find(contributions, a.step, a.chain, a.playerId)) artifacts.add(`${a.chain}:${a.step}`);
  }
  return { artifacts };
}

export function detectAnswers(contributions: ChaosContribution[]): DetectAnswer[] {
  return contributions.flatMap((c) =>
    c.payload.kind === "answer" ? [{ step: c.step, chain: c.chain, playerId: c.playerId, ...c.payload.answer }] : [],
  );
}

function reveal(
  plan: MatchPlan,
  contributions: ChaosContribution[],
  content: ChaosContent,
  chain: number,
): ChainReveal {
  const label = (id: string) =>
    [...content.objects, ...content.mutations].find((x) => x.id === id)?.label ?? "Something";
  const c = plan.chains[chain];
  const answers = detectAnswers(contributions);
  return {
    chain,
    object: { id: c.objectId, label: label(c.objectId) },
    creatorId: at(plan, 1, chain)[0].playerId,
    layers: layersOf(plan, contributions, chain, 99),
    mutations: c.mutationIds.map((id, i) => ({
      id,
      label: label(id),
      step: i === 0 ? 2 : 4,
      mutatorId: at(plan, i === 0 ? 2 : 4, chain)[0].playerId,
    })),
    detections: answers
      .filter((a) => a.chain === chain)
      .map((a) => ({
        step: a.step,
        playerId: a.playerId,
        objectRight: a.objectId === undefined ? null : a.objectId === c.objectId,
        mutationRight: a.mutationId === undefined ? null : a.mutationId === c.mutationIds[a.step === 3 ? 0 : 1],
      })),
  };
}

function stepInfo(match: ChaosMatch): NonNullable<ChaosPlayerView["step"]> {
  const { plan } = match;
  const def = plan.steps.find((s) => s.index === match.step)!;
  return {
    index: def.index,
    count: plan.steps.length,
    kind: def.kind,
    round: def.round,
    deadline: stepDeadline(plan, def.index, new Date(match.phaseStartedAt)).toISOString(),
    autoSkipAt: stepAutoSkipAt(plan, def.index, new Date(match.phaseStartedAt)).toISOString(),
  };
}

/** Players still in the room who owe work in the open step. */
function waitingOnIn(match: ChaosMatch, contributions: ChaosContribution[], activePlayerIds: Set<string>): string[] {
  const jobs = match.plan.assignments.filter((a) => a.step === match.step && activePlayerIds.has(a.playerId));
  return [...new Set(jobs.filter((a) => !find(contributions, a.step, a.chain, a.playerId)).map((a) => a.playerId))];
}

function recapOf(match: ChaosMatch, contributions: ChaosContribution[], scores: ScoreEntry[]) {
  const { plan } = match;
  const missing = missingWork(plan, contributions, plan.steps.length);
  const answers = detectAnswers(contributions);
  return {
    points: totals(scores),
    titles: titlesFor(plan, scores, answers, missing),
    sync: plan.playerOrder.length === 2 ? duoSync(plan, answers, missing) : null,
  };
}

export function playerView(input: {
  match: ChaosMatch;
  contributions: ChaosContribution[];
  scores: ScoreEntry[];
  activePlayerIds: Set<string>;
  meId: string;
  content: ChaosContent;
}): ChaosPlayerView {
  const { match, contributions, content, meId } = input;
  const { plan } = match;
  const objectLabel = (id: string) => content.objects.find((o) => o.id === id)?.label ?? id;
  const mutation = (id: string) => content.mutations.find((m) => m.id === id);
  const choices = (ids: string[], label: (id: string) => string | undefined): Choice[] =>
    ids.map((id) => ({ id, label: label(id) ?? id }));

  let step: ChaosPlayerView["step"] = null;
  const myJobs: ChaosJob[] = [];
  let waitingOn: string[] = [];
  if (match.phase === "STEP_OPEN") {
    const def = plan.steps.find((s) => s.index === match.step)!;
    step = stepInfo(match);
    waitingOn = waitingOnIn(match, contributions, input.activePlayerIds);
    for (const a of plan.assignments.filter((j) => j.step === match.step && j.playerId === meId)) {
      const own = find(contributions, a.step, a.chain, meId);
      const chain = plan.chains[a.chain];
      if (def.kind === "create") {
        myJobs.push({
          kind: "create",
          chain: a.chain,
          object: objectLabel(chain.objectId),
          submitted: !!own,
          mine: artifactOf(own),
        });
      } else if (def.kind === "mutate") {
        const card = mutation(chain.mutationIds[def.round === 1 ? 0 : 1])!;
        myJobs.push({
          kind: "mutate",
          chain: a.chain,
          base: layersOf(plan, contributions, a.chain, a.step),
          mutation: { label: card.label, drawHint: card.drawHint },
          submitted: !!own,
          mine: artifactOf(own),
        });
      } else {
        const set = plan.choices[choiceKey(a.chain, a.step)];
        myJobs.push({
          kind: "detect",
          chain: a.chain,
          layers: layersOf(plan, contributions, a.chain, a.step),
          objectChoices: set.objectIds ? choices(set.objectIds, objectLabel) : null,
          mutationChoices: choices(set.mutationIds, (id) => mutation(id)?.label),
          submitted: !!own,
          mine: own?.payload.kind === "answer" ? own.payload.answer : null,
        });
      }
    }
  }

  const revealUpTo =
    match.phase === "RECAP" ? plan.chains.length - 1 : match.phase === "REVEAL" ? (match.revealChain ?? -1) : -1;
  const reveals = Array.from({ length: revealUpTo + 1 }, (_, chain) => reveal(plan, contributions, content, chain));

  return {
    matchId: match.id,
    phase: match.phase,
    stateVersion: match.stateVersion,
    isDuo: plan.playerOrder.length === 2,
    chainCount: plan.chains.length,
    step,
    myJobs,
    waitingOn,
    reveals,
    revealChain: match.phase === "REVEAL" ? match.revealChain : null,
    recap: match.phase === "RECAP" ? recapOf(match, contributions, input.scores) : null,
  };
}

/**
 * The Party Screen's view (docs/usvsus-4/07): only what everyone in the room may see.
 * During a step: the timer and how many players are done, never what anyone was given
 * or made. In the reveal: just the chain on screen now. Then the recap.
 */
export interface ChaosSpectatorView {
  matchId: string;
  phase: ChaosMatch["phase"];
  stateVersion: number;
  isDuo: boolean;
  chainCount: number;
  step: ChaosPlayerView["step"];
  /** Players done with this step, out of the players who have work in it (counts only). */
  progress: { done: number; total: number } | null;
  /** The chain being revealed (REVEAL only). */
  reveal: ChainReveal | null;
  recap: ChaosPlayerView["recap"];
}

export function spectatorView(input: {
  match: ChaosMatch;
  contributions: ChaosContribution[];
  scores: ScoreEntry[];
  activePlayerIds: Set<string>;
  content: ChaosContent;
}): ChaosSpectatorView {
  const { match, contributions, content } = input;
  const { plan } = match;
  let progress: ChaosSpectatorView["progress"] = null;
  if (match.phase === "STEP_OPEN") {
    const working = new Set(
      plan.assignments
        .filter((a) => a.step === match.step && input.activePlayerIds.has(a.playerId))
        .map((a) => a.playerId),
    );
    progress = {
      done: working.size - waitingOnIn(match, contributions, input.activePlayerIds).length,
      total: working.size,
    };
  }
  return {
    matchId: match.id,
    phase: match.phase,
    stateVersion: match.stateVersion,
    isDuo: plan.playerOrder.length === 2,
    chainCount: plan.chains.length,
    step: match.phase === "STEP_OPEN" ? stepInfo(match) : null,
    progress,
    reveal:
      match.phase === "REVEAL" && match.revealChain !== null
        ? reveal(plan, contributions, content, match.revealChain)
        : null,
    recap: match.phase === "RECAP" ? recapOf(match, contributions, input.scores) : null,
  };
}
