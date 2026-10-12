/**
 * Chaos DNA v1 for Mutation Machine: turns players + content + a seed into a
 * frozen match plan (steps, cards, every role assignment, every set of choices).
 * Pure and deterministic. Rules: docs/usvsus-4/03-mini-game-rules.md.
 */
import type { ChaosContent, MutationCard, ObjectCard } from "./content";
import { shuffled, seededRng, type Rng } from "./rng";

export const GAME_ID = "mutation_machine";
export const GAME_VERSION = 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/** Most detectives per chain per step: keeps the detect step the same length for 6 or 10 players. */
export const MAX_DETECTIVES = 3;
const CHOICES = 4;

export type StepKind = "create" | "mutate" | "detect";
export type Role = "creator" | "mutator" | "detective";
export type Vibe = "surprise" | "chill" | "chaos" | "deep";

export interface StepDef {
  index: number; // 1-based
  kind: StepKind;
  /** Which mutation this step is about (1 or 2); 0 for create. */
  round: 0 | 1 | 2;
  seconds: number;
}

export interface Assignment {
  step: number;
  chain: number;
  playerId: string;
  role: Role;
}

export interface ChoiceSet {
  /** Asked only when the detectives don't already know the original. */
  objectIds?: string[];
  mutationIds: string[];
}

export interface MatchPlan {
  gameId: typeof GAME_ID;
  gameVersion: number;
  contentVersion: number;
  seed: number;
  vibe: Vibe;
  /** Seeded shuffle of the players; chain i starts with playerOrder[i]. */
  playerOrder: string[];
  steps: StepDef[];
  chains: Array<{ objectId: string; mutationIds: [string, string] }>;
  assignments: Assignment[];
  /** Keyed by `${chain}:${step}` for detect steps. */
  choices: Record<string, ChoiceSet>;
}

export const choiceKey = (chain: number, step: number) => `${chain}:${step}`;

export function stepsFor(playerCount: number): StepDef[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS)
    throw new Error(`unsupported player count ${playerCount}`);
  return [
    { index: 1, kind: "create", round: 0, seconds: 60 },
    { index: 2, kind: "mutate", round: 1, seconds: 40 },
    { index: 3, kind: "detect", round: 1, seconds: 45 },
    { index: 4, kind: "mutate", round: 2, seconds: 40 },
    { index: 5, kind: "detect", round: 2, seconds: 45 },
  ];
}

/** Who does what. Offsets are uniform, so everyone gets the same amount of work in each step. */
export function assign(playerOrder: string[]): Assignment[] {
  const n = playerOrder.length;
  const p = (i: number) => playerOrder[((i % n) + n) % n];
  const out: Assignment[] = [];
  for (let chain = 0; chain < n; chain++) {
    out.push({ step: 1, chain, playerId: p(chain), role: "creator" });
    out.push({ step: 2, chain, playerId: p(chain + 1), role: "mutator" });
    if (n === 2) {
      // Duo (co-op): you find out what your partner did to your own drawing.
      out.push({ step: 3, chain, playerId: p(chain), role: "detective" });
      out.push({ step: 4, chain, playerId: p(chain + 1), role: "mutator" });
      out.push({ step: 5, chain, playerId: p(chain), role: "detective" });
      continue;
    }
    const k1 = Math.min(MAX_DETECTIVES, n - 2);
    for (let k = 0; k < k1; k++) out.push({ step: 3, chain, playerId: p(chain + 2 + k), role: "detective" });
    out.push({ step: 4, chain, playerId: p(chain + 2), role: "mutator" });
    // Anyone but the second mutator: earlier contributors know the old parts, not the new mutation.
    const k2 = Math.min(MAX_DETECTIVES, n - 1);
    for (let k = 0; k < k2; k++) out.push({ step: 5, chain, playerId: p(chain + 3 + k), role: "detective" });
  }
  return out;
}

/** Prefer cards not seen recently; fall back to recent ones rather than failing. */
function freshFirst<T extends { id: string }>(cards: T[], recent: Set<string>, rng: Rng): T[] {
  const mixed = shuffled(cards, rng);
  return [...mixed.filter((c) => !recent.has(c.id)), ...mixed.filter((c) => recent.has(c.id))];
}

/** The answer plus 3 decoys, all from different families, shuffled. */
function choicesFor<T extends { id: string; family: string }>(
  answer: T,
  pool: T[],
  exclude: Set<string>,
  rng: Rng,
): string[] {
  const usedFamilies = new Set([answer.family]);
  const picks: T[] = [answer];
  for (const card of shuffled(pool, rng)) {
    if (picks.length === CHOICES) break;
    if (exclude.has(card.id) || card.id === answer.id || usedFamilies.has(card.family)) continue;
    picks.push(card);
    usedFamilies.add(card.family);
  }
  if (picks.length < CHOICES) throw new Error("not enough card families for choices");
  return shuffled(picks, rng).map((c) => c.id);
}

export interface PlanInput {
  playerIds: string[];
  content: ChaosContent;
  seed: number;
  vibe?: Vibe;
  /** Card ids this room saw recently (e.g. the match before a rematch). */
  recent?: { objectIds?: string[]; mutationIds?: string[] };
}

export function planMatch(input: PlanInput): MatchPlan {
  const n = input.playerIds.length;
  const steps = stepsFor(n);
  const rng = seededRng(input.seed);
  const playerOrder = shuffled(input.playerIds, rng);
  const { objects, mutations } = input.content;

  const recentObjects = new Set(input.recent?.objectIds ?? []);
  const recentMutations = new Set(input.recent?.mutationIds ?? []);
  const chosenObjects: ObjectCard[] = freshFirst(objects, recentObjects, rng).slice(0, n);
  if (chosenObjects.length < n) throw new Error("not enough objects");

  const usedMutations = new Set<string>();
  const chains: MatchPlan["chains"] = chosenObjects.map((object) => {
    const fits = freshFirst(
      mutations.filter((m) => !m.incompatibleWith?.includes(object.family)),
      recentMutations,
      rng,
    ).filter((m) => !usedMutations.has(m.id));
    const [first, second] = [fits[0], fits.find((m) => m.id !== fits[0]?.id && m.family !== fits[0]?.family)];
    if (!first || !second) throw new Error("not enough mutations");
    usedMutations.add(first.id);
    usedMutations.add(second.id);
    return { objectId: object.id, mutationIds: [first.id, second.id] };
  });

  const byId = new Map<string, MutationCard>(mutations.map((m) => [m.id, m]));
  const objectById = new Map<string, ObjectCard>(objects.map((o) => [o.id, o]));
  const choices: MatchPlan["choices"] = {};
  chains.forEach((chain, i) => {
    const object = objectById.get(chain.objectId)!;
    const [m1, m2] = chain.mutationIds.map((id) => byId.get(id)!);
    const fitting = mutations.filter((m) => !m.incompatibleWith?.includes(object.family));
    choices[choiceKey(i, 3)] = {
      // Duo detectives drew the original themselves.
      ...(n === 2 ? {} : { objectIds: choicesFor(object, objects, new Set(), rng) }),
      mutationIds: choicesFor(m1, fitting, new Set([m2.id]), rng),
    };
    choices[choiceKey(i, 5)] = { mutationIds: choicesFor(m2, fitting, new Set([m1.id]), rng) };
  });

  return {
    gameId: GAME_ID,
    gameVersion: GAME_VERSION,
    contentVersion: input.content.contentVersion,
    seed: input.seed,
    vibe: input.vibe ?? "surprise",
    playerOrder,
    steps,
    chains,
    assignments: assign(playerOrder),
    choices,
  };
}
