import type { Mode } from "./room";

export const GAME_TYPES = ["mind_reader", "most_likely", "this_or_that"] as const;
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
  /** Who's More Likely: the Circle badge for whoever gets the most votes, e.g. "Future Millionaire 💰". */
  award?: string;
  /** Premium pack slug; questions without one are in the free game. */
  pack?: string;
}

/**
 * One player's answer to one question. Which fields are used depends on the game:
 * - This or That: `optionId` (own pick) and, in 2-player modes, `predictionId` (guess of partner's pick)
 * - Mind Reader: `optionId` (the subject's own answer, or the predictor's guess)
 * - Who's More Likely: `targetPlayerId`
 * - Any game: `{ skipped: true }` — no penalty (design doc §13)
 */
export interface PlayerAnswer {
  optionId?: string;
  predictionId?: string;
  targetPlayerId?: string;
  skipped?: true;
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
  /** Premium pack this game was played with, if any. */
  packSlug: string | null;
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
  /** Mind Reader: who each question is about, parallel to questionIds. */
  subjectPlayerIds: Array<string | null>;
}

export interface GameResponse {
  id: string;
  sessionId: string;
  roundId: string;
  questionId: string;
  playerId: string;
  answer: PlayerAnswer;
  submittedAt: string;
}

/** Points (or a badge) locked in at a reveal. One row per player per question. */
export interface ScoreEntry {
  playerId: string;
  roundIndex: number;
  questionIndex: number;
  points: number;
  award: string | null;
}

export interface QuestionReveal {
  /** Everyone's answers — null when votes are anonymous (Circle's Who's More Likely). */
  answers: Array<{ playerId: string; answer: PlayerAnswer }> | null;
  /** Anonymous vote counts per player (Circle's Who's More Likely). */
  votes: Array<{ targetPlayerId: string; count: number }> | null;
  skippedCount: number;
  /** Points each player earned on this question. */
  points: Record<string, number>;
  award: { label: string; playerIds: string[] } | null;
}

/** Across games in one room (after a Rematch): wins in 2-player modes, badges in Circle. */
export interface Series {
  /** Finished games counted (games that ended early don't count). */
  games: number;
  kind: "wins" | "badges";
  /** Players still in the room, best first. 2-player: games won. Circle: badges earned. */
  standings: Array<{ playerId: string; count: number }>;
  /** 2-player modes: games that ended in a tie. */
  draws: number;
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
  question: {
    id: string;
    prompt: string;
    options: QuestionOption[];
    subjectPlayerId: string | null;
  } | null;
  /** Mind Reader: answering about yourself, or guessing. Everyone else: "player". */
  myRole: "subject" | "predictor" | "player" | null;
  answeredPlayerIds: string[];
  myAnswer: PlayerAnswer | null;
  reveal: QuestionReveal | null;
  /** Running totals (2-player modes). Empty in Circle, which plays for badges instead. */
  standings: Array<{ playerId: string; points: number }>;
  /** Points earned in the current round, shown on the scoreboard. */
  roundPoints: Record<string, number>;
  /** Circle badges earned so far. */
  awards: Array<{ label: string; playerId: string }>;
  /** The frozen end-of-game report. Only present once the game is FINISHED. */
  wrapped: WrappedReport | null;
  /** Premium pack this game is played with, if any. */
  packSlug: string | null;
  /** REVEAL only: streak and lead-change callouts for this player (see lib/game/moments.ts). */
  moments: { streak: number; newLeaderId: string | null; firstLead: boolean } | null;
  /** Across games in this room (after a Rematch): wins in 2-player modes, badges in Circle. */
  series: Series | null;
  /** How long ago this step started, by the server's clock (a refresh mid-reveal skips the drumroll). */
  phaseAgeMs: number;
}

/**
 * End-of-game report (design doc §7, S11). Built once when the game finishes and
 * stored as-is, so it reads the same for everyone and survives players leaving.
 * Circle reports never say who voted for whom — only badge winners and counts.
 */
export interface WrappedReport {
  version: 1;
  sessionId: string;
  mode: Mode;
  roomName: string | null;
  /** Everyone still in the room when the game ended (with a nickname snapshot). */
  players: Array<{ id: string; nickname: string; points: number; awards: string[] }>;
  /** True when the game ended because too few people were left. */
  endedEarly: boolean;
  /** 2-player modes: who has the most points (two ids for a tie). Null in Circle. */
  winnerIds: string[] | null;
  /** 2-player modes: points earned out of points possible, 0–100. Null in Circle or when nothing was scoreable. */
  usScore: number | null;
  /** 2-player modes: points per round. Empty in Circle. */
  rounds: Array<{ gameType: GameType; earned: number; possible: number }>;
  /** 2-player modes: points per question category, best first. Empty in Circle. */
  categories: Array<{ category: QuestionCategory; earned: number; possible: number }>;
  /** Circle badges, one entry per question that handed one out. */
  awards: Array<{ label: string; playerIds: string[] }>;
  highlight: WrappedHighlight | null;
  /** A short deterministic reaction line. */
  roast: string;
}

export type WrappedHighlight =
  | {
      /** 2-player: the most surprising disagreement, with what each person picked. */
      kind: "disagreement";
      gameType: GameType;
      prompt: string;
      lines: Array<{ playerId: string; verb: "said" | "guessed" | "picked"; answer: string }>;
    }
  | {
      /** Circle: the This or That that split the group the most (counts only). */
      kind: "split";
      prompt: string;
      counts: Array<{ label: string; count: number }>;
    };
