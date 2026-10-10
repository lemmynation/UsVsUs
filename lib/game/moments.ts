/**
 * Reveal "moments" (engagement phase): streaks and lead changes, worked out from
 * locked-in scores only, so every phone shows the same callout. Pure and tested.
 */
import type { ScoreEntry } from "@/types/game";

/** Scoring this many reveals in a row earns a "🔥 N in a row" callout. */
export const STREAK_CALLOUT = 3;

export interface RevealPosition {
  roundIndex: number;
  questionIndex: number;
  /** Mind Reader: the player the question is about (they can't score on it). */
  subjectPlayerId: string | null;
}

export interface RevealMoments {
  /** How many reveals in a row (ending with this one) the player scored on; 0 if not this one. */
  streak: number;
  /** Who just took the lead with this reveal, if anyone did (2-player standings only). */
  newLeaderId: string | null;
  /** True when nobody led before this reveal (the first lead of the game). */
  firstLead: boolean;
}

const at = (p: { roundIndex: number; questionIndex: number }) => `${p.roundIndex}.${p.questionIndex}`;

function pointsAt(scores: ScoreEntry[]): Map<string, Map<string, number>> {
  const byPosition = new Map<string, Map<string, number>>();
  for (const e of scores) {
    const key = at(e);
    const row = byPosition.get(key) ?? new Map<string, number>();
    row.set(e.playerId, (row.get(e.playerId) ?? 0) + e.points);
    byPosition.set(key, row);
  }
  return byPosition;
}

/** The single player strictly ahead with points, or null (no points yet, or a tie at the top). */
export function leaderOf(totals: Map<string, number>): string | null {
  let best: string | null = null;
  let bestPoints = 0;
  let tied = false;
  for (const [player, points] of totals) {
    if (points > bestPoints) {
      best = player;
      bestPoints = points;
      tied = false;
    } else if (points === bestPoints && points > 0) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * @param revealed every revealed question so far, in play order; the last one is the reveal on screen.
 * @param playerIds the players still in the game (scores for anyone else are ignored).
 */
export function revealMoments(input: {
  scores: ScoreEntry[];
  revealed: RevealPosition[];
  meId: string;
  playerIds: string[];
  trackLeader: boolean;
}): RevealMoments {
  const { revealed, meId } = input;
  const here = new Set(input.playerIds);
  const points = pointsAt(input.scores.filter((e) => here.has(e.playerId)));
  const mine = (p: RevealPosition) => points.get(at(p))?.get(meId) ?? 0;

  // Streak: count back from this reveal; questions about me (I can't score) don't break it.
  let streak = 0;
  for (let i = revealed.length - 1; i >= 0; i--) {
    const p = revealed[i];
    if (p.subjectPlayerId === meId) {
      if (i === revealed.length - 1) break; // this reveal was about me: no streak callout now
      continue;
    }
    if (mine(p) <= 0) break;
    streak++;
  }

  let newLeaderId: string | null = null;
  let firstLead = false;
  const current = revealed.at(-1);
  if (input.trackLeader && current) {
    const totals = (upTo: RevealPosition[]) => {
      const sum = new Map<string, number>(input.playerIds.map((id) => [id, 0]));
      for (const p of upTo) for (const [id, n] of points.get(at(p)) ?? []) sum.set(id, (sum.get(id) ?? 0) + n);
      return sum;
    };
    const before = leaderOf(totals(revealed.slice(0, -1)));
    const after = leaderOf(totals(revealed));
    if (after && after !== before) {
      newLeaderId = after;
      firstLead = before === null;
    }
  }
  return { streak, newLeaderId, firstLead };
}
