/**
 * Pure game flow (design doc §12). Given where a game is and how its rounds are
 * laid out, decides where it goes next and who may move it there.
 */
import type { GamePhase, GamePosition, GameSession } from "@/types/game";

export const GAME_CONFIG = {
  /** Free session: 3 rounds × 5 questions ≈ 8–12 minutes (design doc §6). */
  rounds: 3,
  questionsPerRound: 5,
  /** In a game, a host silent for this long hands control to someone still here. */
  hostAwayMs: 60_000,
} as const;

type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };
const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

export const START_POSITION: GamePosition = { phase: "ROUND_INTRO", roundIndex: 0, questionIndex: 0 };

/** questionCounts[i] = number of questions in round i. */
export function nextPosition(pos: GamePosition, questionCounts: number[]): GamePosition {
  const { phase, roundIndex, questionIndex } = pos;
  switch (phase) {
    case "ROUND_INTRO":
      return { phase: "QUESTION_OPEN", roundIndex, questionIndex: 0 };
    case "QUESTION_OPEN":
      return { phase: "REVEAL", roundIndex, questionIndex };
    case "REVEAL":
      return questionIndex + 1 < questionCounts[roundIndex]
        ? { phase: "QUESTION_OPEN", roundIndex, questionIndex: questionIndex + 1 }
        : { phase: "SCOREBOARD", roundIndex, questionIndex };
    case "SCOREBOARD":
      return roundIndex + 1 < questionCounts.length
        ? { phase: "ROUND_INTRO", roundIndex: roundIndex + 1, questionIndex: 0 }
        : { phase: "FINISHED", roundIndex, questionIndex };
    case "FINISHED":
      return pos;
  }
}

export type AdvanceError = "not_host" | "stale_state" | "game_finished" | "no_answers_yet";

/**
 * The host moves the game along. While a question is open the host may only
 * "reveal now" once at least one answer is in — otherwise everyone answering
 * reveals it automatically.
 */
export function checkCanAdvance(
  session: GameSession,
  actorIsHost: boolean,
  expectedVersion: number,
  answersForCurrentQuestion: number,
): Result<null, AdvanceError> {
  if (session.phase === "FINISHED") return fail("game_finished");
  if (!actorIsHost) return fail("not_host");
  if (expectedVersion !== session.stateVersion) return fail("stale_state");
  if (session.phase === "QUESTION_OPEN" && answersForCurrentQuestion === 0) return fail("no_answers_yet");
  return ok(null);
}

/** Everyone still in the room has answered the open question. */
export function allAnswered(activePlayerIds: string[], answeredPlayerIds: string[]): boolean {
  if (activePlayerIds.length === 0) return false;
  const answered = new Set(answeredPlayerIds);
  return activePlayerIds.every((id) => answered.has(id));
}

export function isQuestionPhase(phase: GamePhase): boolean {
  return phase === "QUESTION_OPEN" || phase === "REVEAL";
}
