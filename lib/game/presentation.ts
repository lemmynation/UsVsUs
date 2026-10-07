/**
 * Display copy that depends on game data. Deterministic (design doc §7: a short
 * deterministic reaction in MVP; AI copy can come later). Question text itself
 * always comes from the question bank, never from here.
 */
import type { GameType, QuestionOption } from "@/types/game";
import type { Mode } from "@/types/room";

export const GAME_TYPE_META: Record<GameType, { title: string; emoji: string; rules: string }> = {
  this_or_that: {
    title: "This or That",
    emoji: "⚖️",
    rules: "Pick one. Answers stay hidden until everyone's locked in — then the reveal.",
  },
};

export interface RevealTally {
  option: QuestionOption;
  playerIds: string[];
}

export function tallyAnswers(
  options: QuestionOption[],
  answers: Array<{ playerId: string; optionId: string }>,
): RevealTally[] {
  return options.map((option) => ({
    option,
    playerIds: answers.filter((a) => a.optionId === option.id).map((a) => a.playerId),
  }));
}

/** One short headline for the reveal. */
export function revealReaction(mode: Mode, tally: RevealTally[]): string {
  const total = tally.reduce((n, t) => n + t.playerIds.length, 0);
  if (total === 0) return "Nobody answered this one!";
  const picked = tally.filter((t) => t.playerIds.length > 0);
  if (total === 1) return "Only one answer — the rest stayed mysterious.";
  if (picked.length === 1) return mode === "circle" ? "Total agreement! 🤝" : "Same brain! 🧠";
  if (mode !== "circle") return "Opposites attract 😅";

  const top = Math.max(...picked.map((t) => t.playerIds.length));
  const leaders = picked.filter((t) => t.playerIds.length === top);
  if (leaders.length > 1) return "Perfect split! ⚖️";
  return `Most of you picked ${leaders[0].option.label}`;
}
