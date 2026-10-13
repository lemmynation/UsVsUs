/**
 * Group Wrapped for a Mutation Machine match (UsVsUs 4.2 Sprint 3). Built once when the
 * match reaches the recap and frozen, so it reads the same for everyone and survives
 * players leaving. Built only from locked-in points and what the reveals already showed
 * (cards, who made which layer, how many spotted each mutation): never drawings, and
 * never who answered what. Pure.
 */
import type { ChaosContribution } from "@/types/chaos";
import type { ChaosContent } from "./content";
import type { MatchPlan } from "./plan";
import { detectAnswers, missingWork } from "./projections";
import { duoSync, titlesFor, totals, type ScoreEntry, type Title } from "./scoring";

export interface ChaosWrappedReport {
  kind: "chaos";
  matchId: string;
  roomName: string | null;
  isDuo: boolean;
  chainCount: number;
  /**
   * Everyone who played, highest points first (ties keep the turn order). A player who left
   * before the recap has no nickname (and, their points gone with them, usually 0).
   */
  players: Array<{ id: string; nickname: string | null; points: number; title: Title }>;
  teamScore: number;
  /** Duo: share of mutations the pair spotted (0–1). */
  sync: number | null;
  /** Share of all mutation guesses that were right (0–1), or null if nobody guessed. */
  spotRate: number | null;
  /** The mutation that fooled the most detectives. */
  sneakiest: MutationMoment | null;
  /** The mutation the most detectives spotted. */
  clearest: MutationMoment | null;
}

export const TITLE_EMOJI: Record<Title, string> = {
  "Sharp Eye": "🔎",
  "Clear Signal": "📡",
  "Chaos Agent": "🌪️",
  "Mind Meld": "🧠",
  Wildcard: "🃏",
};

const percent = (share: number) => Math.round(share * 100);

/** The big line at the top of the recap and the share card. */
export function chaosHeadline(report: ChaosWrappedReport): string {
  if (report.isDuo && report.sync !== null) return `${percent(report.sync)}% in sync`;
  if (report.spotRate !== null) return `${percent(report.spotRate)}% of mutations spotted`;
  return "That's the chaos!";
}

export interface MutationMoment {
  label: string;
  /** What the chain started as. */
  object: string;
  mutatorId: string;
  spotted: number;
  guesses: number;
}

export function buildChaosWrapped(input: {
  matchId: string;
  roomName: string | null;
  plan: MatchPlan;
  contributions: ChaosContribution[];
  scores: ScoreEntry[];
  /** Everyone still in the room. */
  players: Array<{ id: string; nickname: string }>;
  content: ChaosContent;
}): ChaosWrappedReport {
  const { plan, contributions, content } = input;
  const label = (id: string) =>
    [...content.objects, ...content.mutations].find((x) => x.id === id)?.label ?? "Something";
  const missing = missingWork(plan, contributions, plan.steps.length);
  const answers = detectAnswers(contributions);
  const inRoom = new Set(input.players.map((p) => p.id));
  const scores = input.scores.filter((e) => inRoom.has(e.playerId));
  const points = totals(scores);
  const titles = titlesFor(plan, scores, answers, missing);
  const isDuo = plan.playerOrder.length === 2;

  // One moment per mutation that was on screen and guessed at: the reveal's "X of Y spotted it".
  const moments: MutationMoment[] = [];
  for (const step of [3, 5] as const) {
    const round = step === 3 ? 0 : 1;
    const mutateStep = step === 3 ? 2 : 4;
    plan.chains.forEach((chain, c) => {
      if (missing.artifacts.has(`${c}:1`) || missing.artifacts.has(`${c}:${mutateStep}`)) return;
      const guesses = answers.filter((a) => a.step === step && a.chain === c && a.mutationId);
      if (guesses.length === 0) return;
      moments.push({
        label: label(chain.mutationIds[round]),
        object: label(chain.objectId),
        mutatorId: plan.assignments.find((a) => a.step === mutateStep && a.chain === c)!.playerId,
        spotted: guesses.filter((a) => a.mutationId === chain.mutationIds[round]).length,
        guesses: guesses.length,
      });
    });
  }
  const guesses = moments.reduce((n, m) => n + m.guesses, 0);
  const spotted = moments.reduce((n, m) => n + m.spotted, 0);
  // `better(a, b) > 0` when a beats b; the earliest wins a tie, so the pick is stable.
  const pick = (eligible: (m: MutationMoment) => boolean, better: (a: MutationMoment, b: MutationMoment) => number) =>
    moments.filter(eligible).reduce<MutationMoment | null>((top, m) => (!top || better(m, top) > 0 ? m : top), null);
  const sneakiest = pick(
    (m) => m.spotted < m.guesses,
    (a, b) => a.guesses - a.spotted - (b.guesses - b.spotted),
  );
  // Highest share spotted, then the most detectives.
  const clearest = pick(
    (m) => m.spotted > 0,
    (a, b) => a.spotted / a.guesses - b.spotted / b.guesses || a.spotted - b.spotted,
  );

  return {
    kind: "chaos",
    matchId: input.matchId,
    roomName: input.roomName,
    isDuo,
    chainCount: plan.chains.length,
    players: plan.playerOrder
      .map((id) => ({
        id,
        nickname: input.players.find((p) => p.id === id)?.nickname ?? null,
        points: points[id] ?? 0,
        title: titles[id] ?? "Wildcard",
      }))
      .sort((a, b) => b.points - a.points),
    teamScore: Object.values(points).reduce((a, b) => a + b, 0),
    sync: isDuo ? duoSync(plan, answers, missing) : null,
    spotRate: guesses > 0 ? spotted / guesses : null,
    sneakiest,
    // The same mutation can't be both.
    clearest: clearest && clearest !== sneakiest ? clearest : null,
  };
}
