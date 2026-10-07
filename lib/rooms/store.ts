import type { QuestionHistory } from "@/lib/game/question-picker";
import type {
  GamePosition,
  GameResponse,
  GameRound,
  GameSession,
  GameType,
  PlayerAnswer,
  Question,
  ScoreEntry,
  WrappedReport,
} from "@/types/game";
import type { Mode, Player, Room } from "@/types/room";

export interface AnalyticsEvent {
  anonymousSessionId: string | null;
  roomId: string | null;
  eventName: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

/**
 * Persistence boundary for rooms. Implementations must enforce the hard
 * invariants (capacity, open status, unique active nickname, host handover)
 * atomically — rules.ts gives friendly errors first, the store is the backstop
 * for races between concurrent requests.
 */
export interface RoomStore {
  createRoom(input: {
    joinCode: string;
    mode: Mode;
    name: string | null;
    expiresAt: string;
    now: string;
    host: { nickname: string; sessionTokenHash: string };
  }): Promise<{ room: Room; host: Player } | "join_code_taken">;

  getRoomById(id: string): Promise<Room | null>;
  getRoomByCode(joinCode: string): Promise<Room | null>;

  /** All players in the room, including kicked ones. */
  listPlayers(roomId: string): Promise<Player[]>;

  addPlayer(input: {
    roomId: string;
    nickname: string;
    sessionTokenHash: string;
    maxPlayers: number;
    now: string;
  }): Promise<Player | "room_full" | "room_not_open" | "nickname_taken">;

  /**
   * LOBBY → IN_GAME and create the game session with its planned rounds, all atomically.
   * Re-checks status and player count under the room lock.
   */
  startGame(input: {
    roomId: string;
    minPlayers: number;
    rounds: Array<{ gameType: GameType; questionIds: string[]; subjectPlayerIds: Array<string | null> }>;
    now: string;
  }): Promise<{ session: GameSession; rounds: GameRound[] } | "not_in_lobby" | "not_enough_players">;

  /** The room's most recent game session, if any. */
  getLatestGame(roomId: string): Promise<{ session: GameSession; rounds: GameRound[] } | null>;

  listResponses(roundId: string, questionId: string): Promise<GameResponse[]>;

  /** Every answer in a game (for the Wrapped report). */
  listSessionResponses(sessionId: string): Promise<GameResponse[]>;

  /** The game's frozen Wrapped report, if it has been saved. */
  getWrapped(sessionId: string): Promise<WrappedReport | null>;

  /**
   * Saves the Wrapped report once. If one is already saved (a racing request
   * got there first) that one is kept and returned, so everyone sees the same.
   */
  saveWrapped(sessionId: string, report: WrappedReport, now: string): Promise<WrappedReport>;

  /** Locked-in points and badges for a whole game. */
  listScores(sessionId: string): Promise<ScoreEntry[]>;

  /**
   * Records an answer only while that exact question is open. Must hold off a
   * concurrent advance (Supabase: row lock) so no answer lands after the reveal.
   * A second answer from the same player is ignored ("duplicate").
   */
  submitResponse(input: {
    sessionId: string;
    roundId: string;
    roundIndex: number;
    questionIndex: number;
    questionId: string;
    playerId: string;
    answer: PlayerAnswer;
    now: string;
  }): Promise<"ok" | "duplicate" | "not_open">;

  /**
   * Compare-and-swap: moves the session to `next` only if its stateVersion still
   * equals `expectedVersion`. Finishing also moves the room to WRAPPED.
   */
  advanceGame(input: {
    sessionId: string;
    expectedVersion: number;
    next: GamePosition;
    now: string;
  }): Promise<GameSession | "stale">;

  /**
   * Locks in points/badges for a revealed question. Idempotent per player per
   * question; entries for players who have left are skipped.
   */
  recordScores(sessionId: string, entries: ScoreEntry[]): Promise<void>;

  /** Moves host from one player to another only if `fromPlayerId` is still host. */
  transferHost(roomId: string, fromPlayerId: string, toPlayerId: string): Promise<boolean>;

  getQuestions(): Promise<Question[]>;

  /** Per-question view counts across the given players (by session hash). */
  getQuestionHistory(sessionTokenHashes: string[]): Promise<Map<string, QuestionHistory>>;

  recordQuestionSeen(sessionTokenHashes: string[], questionId: string, now: string): Promise<void>;

  kickPlayer(playerId: string): Promise<void>;

  /** Deletes the player; hands host to the earliest remaining player, or abandons an empty room. */
  removePlayer(playerId: string): Promise<void>;

  touchPlayer(playerId: string, now: string): Promise<void>;

  recordEvent(event: AnalyticsEvent): Promise<void>;
}
