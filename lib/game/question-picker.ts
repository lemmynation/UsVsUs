/**
 * Chooses questions so groups don't see repeats:
 *  1. never the same question twice in one game;
 *  2. questions nobody in the room has seen come first, then the least-seen,
 *     then the longest-ago seen;
 *  3. no two questions in a row from the same category when avoidable;
 *  4. random order among equally fresh questions, so games differ;
 *  5. free games never use premium-pack questions; a pack game puts its pack's
 *     questions first, topping up with fresh free ones.
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
  /** Premium pack being played, if any. */
  pack?: string;
}): Question[] {
  const candidates = input.questions.filter(
    (q) =>
      q.active !== false &&
      q.gameType === input.gameType &&
      q.modes.includes(input.mode) &&
      (q.pack === undefined || q.pack === input.pack),
  );

  // Shuffle first so the stable sort below breaks ties randomly.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(input.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const seen = (q: Question) => input.history.get(q.id);
  const fromPack = (q: Question) => (input.pack !== undefined && q.pack === input.pack ? 0 : 1);
  // Priority tier: fresher first, then (for pack games) the pack's own questions first.
  const tier = (q: Question) => `${String(seen(q)?.seenCount ?? 0).padStart(6, "0")}:${fromPack(q)}`;
  candidates.sort(
    (a, b) => tier(a).localeCompare(tier(b)) || (seen(a)?.lastSeenAt ?? "").localeCompare(seen(b)?.lastSeenAt ?? ""),
  );

  const picked: Question[] = [];
  const remaining = [...candidates];
  while (picked.length < input.count && remaining.length > 0) {
    // Vary categories only among equally fresh, equal-priority questions, so variety
    // never pulls a staler question (or a free one in a pack game) ahead.
    const lastCategory = picked.at(-1)?.category;
    const best = tier(remaining[0]);
    const index = Math.max(
      0,
      remaining.findIndex((q) => tier(q) === best && q.category !== lastCategory),
    );
    picked.push(...remaining.splice(index, 1));
  }
  return picked;
}

/**
 * Lays out a game: one round per entry in `lineup`, each filled with fresh
 * questions of that round's type. A type used in two rounds never repeats a
 * question across them. Rounds with no questions available are dropped.
 */
export function planGame(input: {
  questions: Question[];
  mode: Mode;
  lineup: GameType[];
  perRound: number;
  history: ReadonlyMap<string, QuestionHistory>;
  random: () => number;
  pack?: string;
}): Array<{ gameType: GameType; questionIds: string[] }> {
  const pools = new Map<GameType, Question[]>();
  for (const gameType of new Set(input.lineup)) {
    const rounds = input.lineup.filter((t) => t === gameType).length;
    pools.set(gameType, pickQuestions({ ...input, gameType, count: rounds * input.perRound }));
  }
  const plan: Array<{ gameType: GameType; questionIds: string[] }> = [];
  for (const gameType of input.lineup) {
    const slice = pools.get(gameType)!.splice(0, input.perRound);
    if (slice.length > 0) plan.push({ gameType, questionIds: slice.map((q) => q.id) });
  }
  return plan;
}
