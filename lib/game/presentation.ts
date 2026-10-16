/**
 * Display copy that depends on game data. Deterministic (design doc §7: a short
 * deterministic reaction in MVP; AI copy can come later). Question text itself
 * always comes from the question bank, never from here. Scores are framed as a
 * game, never as a compatibility measure.
 */
import type {
  GameType,
  PlayerAnswer,
  QuestionCategory,
  QuestionOption,
  QuestionReveal,
  WrappedReport,
} from "@/types/game";
import type { Mode } from "@/types/room";
import { isTwoPlayer } from "./engines";

export const GAME_TYPE_META: Record<GameType, { title: string; emoji: string }> = {
  mind_reader: { title: "Mind Reader", emoji: "🔮" },
  this_or_that: { title: "This or That", emoji: "⚖️" },
  most_likely: { title: "Who's More Likely", emoji: "👉" },
};

export const CATEGORY_META: Record<QuestionCategory, { label: string; emoji: string }> = {
  food: { label: "Food", emoji: "🍜" },
  travel: { label: "Travel", emoji: "✈️" },
  habits: { label: "Habits", emoji: "🔁" },
  money: { label: "Money", emoji: "💸" },
  memories: { label: "Memories", emoji: "📸" },
  personality: { label: "Personality", emoji: "🌀" },
  romance: { label: "Romance", emoji: "💘" },
  chaos: { label: "Chaos", emoji: "🌪️" },
};

/**
 * The Wrapped headline. `meId` makes it "You win!" on the winner's own phone; the
 * share image passes null so it reads right for anyone who sees it.
 */
export function wrappedHeadline(report: WrappedReport, meId: string | null): string {
  if (report.endedEarly) return "Game over";
  const winners = report.winnerIds;
  if (!winners || winners.length === 0) return "That's a wrap!";
  if (winners.length > 1) return "It's a tie! 🤝";
  if (winners[0] === meId) return "You win! 🏆";
  const name = report.players.find((p) => p.id === winners[0])?.nickname ?? "Someone";
  return `${name} wins! 🏆`;
}

/**
 * "Lem", "Lem & Ana", "Lem, Ana & Ben". With `maxNamed`, bigger groups read as
 * "4-way tie" so a share card row never turns into a wall of names.
 */
export function formatNames(names: string[], maxNamed = Infinity): string {
  if (names.length > maxNamed) return `${names.length}-way tie`;
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/** Percent of points possible, for breakdown bars. */
export const percentOf = (earned: number, possible: number) =>
  possible > 0 ? Math.round((earned / possible) * 100) : 0;

/** One-line rules for the round intro (design doc S06). */
export function roundRules(gameType: GameType, mode: Mode): string {
  switch (gameType) {
    case "mind_reader":
      return "Take turns: one answers about themselves, the other guesses. A correct guess is 100 points.";
    case "this_or_that":
      return isTwoPlayer(mode)
        ? "Make your pick, then guess your partner's. A correct guess is 50 points."
        : "Pick one. Answers stay hidden until everyone's locked in.";
    case "most_likely":
      return isTwoPlayer(mode)
        ? "Pick who fits best. If you both pick the same person, you each get 75 points."
        : "Vote for who fits best — votes are anonymous. The top pick earns a badge.";
  }
}

export interface RevealTally {
  option: QuestionOption;
  playerIds: string[];
}

/** Groups players under the option they picked (or, for prediction, `field`). */
export function tallyAnswers(
  options: QuestionOption[],
  answers: Array<{ playerId: string; answer: PlayerAnswer }>,
  field: "optionId" | "targetPlayerId" = "optionId",
): RevealTally[] {
  return options.map((option) => ({
    option,
    playerIds: answers.filter((a) => !a.answer.skipped && a.answer[field] === option.id).map((a) => a.playerId),
  }));
}

/** One short headline for a reveal. */
export function revealHeadline(input: {
  gameType: GameType;
  mode: Mode;
  reveal: QuestionReveal;
  options: QuestionOption[];
  subjectPlayerId: string | null;
  nameOf: (playerId: string) => string;
}): string {
  const { gameType, mode, reveal, nameOf } = input;
  const answers = (reveal.answers ?? []).filter((a) => !a.answer.skipped);
  const scorers = Object.keys(reveal.points);

  switch (gameType) {
    case "mind_reader": {
      const subject = input.subjectPlayerId;
      if (!answers.some((a) => a.playerId === subject))
        return `${subject ? nameOf(subject) : "They"} kept it a mystery 🤐`;
      return scorers.length > 0 ? "Mind reader! 🔮" : "Not even close 😅";
    }
    case "this_or_that": {
      if (!isTwoPlayer(mode)) return groupPickHeadline(answers, input.options);
      if (answers.length < 2) return "Only one answer this time.";
      if (scorers.length === 2) return "You know each other! 🧠";
      if (scorers.length === 1) return `${nameOf(scorers[0])} called it 👀`;
      return "Plot twist! Nobody guessed right 😅";
    }
    case "most_likely": {
      if (!isTwoPlayer(mode)) {
        if (!reveal.award) {
          return (reveal.votes ?? []).length > 0
            ? "No clear winner — no badge this time 🤷"
            : "Nobody voted on this one!";
        }
        const winners = formatNames(reveal.award.playerIds.map(nameOf));
        return `🏆 ${reveal.award.label} → ${winners}`;
      }
      if (answers.length < 2) return "Only one vote this time.";
      return scorers.length > 0 ? "Great minds! 🤝" : "You see it differently 👀";
    }
  }
}

function groupPickHeadline(answers: Array<{ answer: PlayerAnswer }>, options: QuestionOption[]): string {
  if (answers.length === 0) return "Nobody answered this one!";
  if (answers.length === 1) return "Only one answer — the rest stayed mysterious.";
  const counts = new Map<string, number>();
  for (const a of answers) counts.set(a.answer.optionId!, (counts.get(a.answer.optionId!) ?? 0) + 1);
  if (counts.size === 1) return "Total agreement! 🤝";
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, c]) => c === top);
  if (leaders.length > 1) return "Perfect split! ⚖️";
  return `Most of you picked ${options.find((o) => o.id === leaders[0][0])?.label ?? "the same thing"}`;
}

/**
 * The round intro's face-off. 2-player modes: you vs. your partner. Circle: you vs.
 * everyone else. Nicknames only (the lobby already shows them to every member).
 */
export function clashSides(
  mode: Mode,
  players: Array<{ id: string; nickname: string }>,
  meId: string,
): [string, string] {
  const others = players.filter((p) => p.id !== meId);
  if (isTwoPlayer(mode)) return ["You", others[0]?.nickname ?? "Your partner"];
  return ["You", others.length === 1 ? "1 other" : `${others.length} others`];
}
