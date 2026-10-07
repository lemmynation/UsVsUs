/**
 * Chooses questions so groups don't see repeats:
 *  1. never the same question twice in one game;
 *  2. questions nobody in the room has seen come first, then the least-seen,
 *     then the longest-ago seen;
 *  3. no two questions in a row from the same category when avoidable;
 *  4. random order among equally fresh questions, so games differ.
 */
import type { Mode } from "@/types/room";
import type { GameType, Question } from "@/types/game";

export interface QuestionHistory {
  /** Total times players in this room have seen the question. */
  seenCount: number;
  /** Most recent time anyone in the room saw it (ISO). */
  lastSeenAt: string;
}

export function pickQuestions(input: {
  questions: Question[];
  mode: Mode;
  gameType: GameType;
  count: number;
  history: ReadonlyMap<string, QuestionHistory>;
  random: () => number;
}): Question[] {
  const candidates = input.questions.filter(
    (q) => q.active !== false && q.gameType === input.gameType && q.modes.includes(input.mode),
  );

  // Shuffle first so the stable sort below breaks ties randomly.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(input.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const seen = (q: Question) => input.history.get(q.id);
  candidates.sort((a, b) => {
    const countDiff = (seen(a)?.seenCount ?? 0) - (seen(b)?.seenCount ?? 0);
    if (countDiff !== 0) return countDiff;
    return (seen(a)?.lastSeenAt ?? "").localeCompare(seen(b)?.lastSeenAt ?? "");
  });

  const picked: Question[] = [];
  const remaining = [...candidates];
  while (picked.length < input.count && remaining.length > 0) {
    const lastCategory = picked.at(-1)?.category;
    const index = Math.max(
      0,
      remaining.findIndex((q) => q.category !== lastCategory),
    );
    picked.push(...remaining.splice(index, 1));
  }
  return picked;
}

/** Splits a fresh pick into rounds. Fewer questions available → fewer/shorter rounds, never repeats. */
export function planRounds(
  questions: Question[],
  rounds: number,
  perRound: number,
): Array<{ gameType: GameType; questionIds: string[] }> {
  const plan: Array<{ gameType: GameType; questionIds: string[] }> = [];
  for (let r = 0; r < rounds; r++) {
    const slice = questions.slice(r * perRound, (r + 1) * perRound);
    if (slice.length === 0) break;
    plan.push({ gameType: slice[0].gameType, questionIds: slice.map((q) => q.id) });
  }
  return plan;
}
