/**
 * Per-game rules (design doc §6): which games a mode plays, who a Mind Reader
 * question is about, what counts as a valid answer. Pure — no I/O.
 */
import type { GameType, PlayerAnswer, Question, QuestionOption } from "@/types/game";
import type { Mode } from "@/types/room";

/** Round lineup per mode. Circle can't play Mind Reader (it's a 2-player game). */
export const ROUND_LINEUP: Record<Mode, GameType[]> = {
  couple: ["mind_reader", "this_or_that", "most_likely"],
  friends: ["mind_reader", "this_or_that", "most_likely"],
  circle: ["most_likely", "this_or_that", "most_likely"],
};

/**
 * Premium games add a fourth round. Circle's is another Who's More Likely, since
 * a premium Circle night is about call-outs and badges (design doc §8).
 */
export const PREMIUM_LINEUP: Record<Mode, GameType[]> = {
  couple: [...ROUND_LINEUP.couple, "this_or_that"],
  friends: [...ROUND_LINEUP.friends, "this_or_that"],
  circle: ["most_likely", "this_or_that", "most_likely", "most_likely"],
};

export const isTwoPlayer = (mode: Mode) => mode !== "circle";

type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

/** Mind Reader alternates who's being guessed about, in join order. */
export function subjectsForRound(
  gameType: GameType,
  questionCount: number,
  playerIdsByJoinOrder: string[],
): Array<string | null> {
  if (gameType !== "mind_reader" || playerIdsByJoinOrder.length === 0) return Array(questionCount).fill(null);
  return Array.from({ length: questionCount }, (_, i) => playerIdsByJoinOrder[i % playerIdsByJoinOrder.length]);
}

/** Who's More Likely is answered with a player; other games use the question's own options. */
export function answerOptions(question: Question, players: Array<{ id: string; nickname: string }>): QuestionOption[] {
  return question.gameType === "most_likely" ? players.map((p) => ({ id: p.id, label: p.nickname })) : question.options;
}

/** Fills Mind Reader's {name} with the subject's nickname. */
export function renderPrompt(prompt: string, subjectNickname: string | null): string {
  return prompt.replaceAll("{name}", subjectNickname ?? "your partner");
}

/**
 * Checks an answer's shape for this question and returns a clean copy (unknown
 * fields dropped). The server never trusts the client to send the right shape.
 */
export function validateAnswer(
  ctx: { question: Question; mode: Mode; activePlayerIds: string[] },
  answer: PlayerAnswer,
): Result<PlayerAnswer, "invalid_answer"> {
  const bad = { ok: false, error: "invalid_answer" } as const;
  if (answer.skipped === true) return { ok: true, value: { skipped: true } };

  const optionIds = new Set(ctx.question.options.map((o) => o.id));
  switch (ctx.question.gameType) {
    case "most_likely":
      if (!answer.targetPlayerId || !ctx.activePlayerIds.includes(answer.targetPlayerId)) return bad;
      return { ok: true, value: { targetPlayerId: answer.targetPlayerId } };
    case "mind_reader":
      if (!answer.optionId || !optionIds.has(answer.optionId)) return bad;
      return { ok: true, value: { optionId: answer.optionId } };
    case "this_or_that": {
      if (!answer.optionId || !optionIds.has(answer.optionId)) return bad;
      if (!isTwoPlayer(ctx.mode)) return { ok: true, value: { optionId: answer.optionId } };
      if (!answer.predictionId || !optionIds.has(answer.predictionId)) return bad;
      return { ok: true, value: { optionId: answer.optionId, predictionId: answer.predictionId } };
    }
  }
}
