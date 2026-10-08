/**
 * Scoring (design doc §7). Pure and deterministic: the same answers always give
 * the same points. Scores are entertainment, not a compatibility measure.
 */
import type { GameType, PlayerAnswer } from "@/types/game";
import type { Mode } from "@/types/room";
import { isTwoPlayer } from "./engines";

export const POINTS = {
  mindReaderCorrect: 100,
  thisOrThatCorrect: 50,
  mostLikelyAgreement: 75,
} as const;

export interface QuestionScore {
  /** Points per player for this question; players who earned nothing are omitted. */
  points: Record<string, number>;
  /** Circle's Who's More Likely: the most-voted player(s) win the badge (ties share it). */
  awardWinners: string[];
}

export function scoreQuestion(input: {
  gameType: GameType;
  mode: Mode;
  subjectPlayerId: string | null;
  responses: Array<{ playerId: string; answer: PlayerAnswer }>;
}): QuestionScore {
  const answered = input.responses.filter((r) => !r.answer.skipped);
  const points: Record<string, number> = {};
  const add = (playerId: string, n: number) => (points[playerId] = (points[playerId] ?? 0) + n);

  switch (input.gameType) {
    case "mind_reader": {
      // The subject answers about themselves; everyone else is predicting them.
      const truth = answered.find((r) => r.playerId === input.subjectPlayerId)?.answer.optionId;
      if (truth === undefined) break; // subject skipped or left: nothing to guess against
      for (const r of answered) {
        if (r.playerId !== input.subjectPlayerId && r.answer.optionId === truth)
          add(r.playerId, POINTS.mindReaderCorrect);
      }
      break;
    }
    case "this_or_that": {
      if (!isTwoPlayer(input.mode)) break; // Circle: a group vote, no points
      for (const guesser of answered) {
        const partner = answered.find((r) => r.playerId !== guesser.playerId);
        if (partner && guesser.answer.predictionId === partner.answer.optionId) {
          add(guesser.playerId, POINTS.thisOrThatCorrect);
        }
      }
      break;
    }
    case "most_likely": {
      if (isTwoPlayer(input.mode)) {
        const [a, b] = answered;
        if (a && b && a.answer.targetPlayerId === b.answer.targetPlayerId) {
          add(a.playerId, POINTS.mostLikelyAgreement);
          add(b.playerId, POINTS.mostLikelyAgreement);
        }
      } else {
        return { points, awardWinners: topVoted(answered) };
      }
      break;
    }
  }
  return { points, awardWinners: [] };
}

/**
 * The most points a question could have given, based on who actually answered —
 * a skip takes that question's points out of play instead of counting against
 * anyone. Used for the Us Score. Circle plays for badges, so it's always 0 there.
 */
export function possiblePoints(input: {
  gameType: GameType;
  mode: Mode;
  subjectPlayerId: string | null;
  responses: Array<{ playerId: string; answer: PlayerAnswer }>;
}): number {
  if (!isTwoPlayer(input.mode)) return 0;
  const answered = input.responses.filter((r) => !r.answer.skipped);
  switch (input.gameType) {
    case "mind_reader": {
      if (!answered.some((r) => r.playerId === input.subjectPlayerId)) return 0;
      return (answered.length - 1) * POINTS.mindReaderCorrect;
    }
    case "this_or_that":
      return answered.length >= 2 ? answered.length * POINTS.thisOrThatCorrect : 0;
    case "most_likely":
      return answered.length >= 2 ? 2 * POINTS.mostLikelyAgreement : 0;
  }
}

/** Anonymous vote tally, most votes first, ties by player id for a stable order. */
export function tallyVotes(
  responses: Array<{ answer: PlayerAnswer }>,
): Array<{ targetPlayerId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of responses) {
    const target = r.answer.targetPlayerId;
    if (target && !r.answer.skipped) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts]
    .map(([targetPlayerId, count]) => ({ targetPlayerId, count }))
    .sort((a, b) => b.count - a.count || a.targetPlayerId.localeCompare(b.targetPlayerId));
}

/** A badge needs at least two people to agree; a spread of single votes is no consensus. */
export const MIN_VOTES_FOR_BADGE = 2;

function topVoted(responses: Array<{ answer: PlayerAnswer }>): string[] {
  const tally = tallyVotes(responses);
  if (tally.length === 0 || tally[0].count < MIN_VOTES_FOR_BADGE) return [];
  return tally.filter((t) => t.count === tally[0].count).map((t) => t.targetPlayerId);
}

/** Sums locked-in points per player. */
export function totalPoints(entries: Array<{ playerId: string; points: number }>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of entries) totals[e.playerId] = (totals[e.playerId] ?? 0) + e.points;
  return totals;
}
