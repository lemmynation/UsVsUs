import type { Mode } from "./room";

/** Phase 2 ships This or That; Mind Reader and Who's More Likely arrive with their engines in Phase 3. */
export const GAME_TYPES = ["this_or_that"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const QUESTION_CATEGORIES = [
  "food",
  "travel",
  "habits",
  "money",
  "memories",
  "personality",
  "romance",
  "chaos",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  gameType: GameType;
  modes: Mode[];
  category: QuestionCategory;
  intensity: "safe" | "playful" | "bold";
  prompt: string;
  options: QuestionOption[];
  /** Inactive questions are never picked for new games but still load for games already using them. */
  active?: boolean;
}

/** Design doc §12. WAITING is a client view of QUESTION_OPEN after you've answered, not a server state. */
export const GAME_PHASES = ["ROUND_INTRO", "QUESTION_OPEN", "REVEAL", "SCOREBOARD", "FINISHED"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface GamePosition {
  phase: GamePhase;
  roundIndex: number;
  questionIndex: number;
}

export interface GameSession extends GamePosition {
  id: string;
  roomId: string;
  status: "active" | "finished";
  /** Bumped on every transition; clients send it back so a double tap can't advance twice. */
  stateVersion: number;
  phaseStartedAt: string;
  startedAt: string;
  endedAt: string | null;
}

export interface GameRound {
  id: string;
  sessionId: string;
  roundIndex: number;
  gameType: GameType;
  questionIds: string[];
}

export interface GameResponse {
  id: string;
  sessionId: string;
  roundId: string;
  questionId: string;
  playerId: string;
  answer: { optionId: string };
  submittedAt: string;
}

/** The game as one player is allowed to see it. Other players' answers appear only in REVEAL. */
export interface GameView {
  sessionId: string;
  phase: GamePhase;
  stateVersion: number;
  gameType: GameType;
  roundIndex: number;
  roundCount: number;
  questionIndex: number;
  questionCount: number;
  question: { id: string; prompt: string; options: QuestionOption[] } | null;
  answeredPlayerIds: string[];
  myAnswer: string | null;
  reveal: { answers: Array<{ playerId: string; optionId: string }> } | null;
}
