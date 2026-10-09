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
import type { Payment, PaymentProviderName } from "@/types/premium";
import type { Mode, Player, Room } from "@/types/room";

export interface AnalyticsEvent {
  anonymousSessionId: string | null;
  roomId: string | null;
  eventName: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

/** A player's rating of a finished game (1 = not for us … 4 = loved it). */
export type FeedbackRating = 1 | 2 | 3 | 4;

export interface FeedbackEntry {
  mode: Mode;
  rating: FeedbackRating;
  comment: string | null;
  createdAt: string;
}

/** Anything older than these timestamps (ISO) is removed by `cleanupExpiredData`. */
export interface CleanupCutoffs {
  /** Rooms whose expiry is before this, with everything in them. */
  rooms: string;
  questionHistory: string;
  events: string;
  paymentEvents: string;
  feedback: string;
}

export interface CleanupResult {
  rooms: number;
  questionHistory: number;
  events: number;
  paymentEvents: number;
  feedback: number;
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
    /** Premium pack: the room's entitlement is re-checked atomically with the start. */
    packSlug?: string;
  }): Promise<{ session: GameSession; rounds: GameRound[] } | "not_in_lobby" | "not_enough_players" | "pack_locked">;

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

  /** Events since `sinceIso`, oldest first, at most `limit`. */
  listEvents(sinceIso: string, limit: number): Promise<AnalyticsEvent[]>;

  /**
   * Retention (design doc §15): deletes expired rooms and everything in them, old
   * question history, old events and old webhook ids. Paid payment records are kept,
   * unlinked from the room; unpaid ones go with it.
   */
  cleanupExpiredData(cutoffs: CleanupCutoffs): Promise<CleanupResult>;

  /**
   * Counts one request against a fixed window shared by every server instance.
   * True while `key` is within `max` hits per `windowMs`.
   */
  hitRateLimit(key: string, max: number, windowMs: number, now: string): Promise<boolean>;

  /** One rating per player per game; sending again replaces it (e.g. adding a comment). */
  saveFeedback(input: {
    roomId: string;
    sessionId: string;
    playerId: string;
    mode: Mode;
    rating: FeedbackRating;
    comment: string | null;
    now: string;
  }): Promise<void>;

  /** Feedback since `sinceIso`, newest first, at most `limit`. */
  listFeedback(sinceIso: string, limit: number): Promise<FeedbackEntry[]>;

  // --- Premium (Phase 5) ---

  /**
   * Opens a pending payment for a room's pack, atomically refusing if the pack is
   * already unlocked or the game has started. A recent pending payment that
   * already has a checkout page is returned instead (`reused`).
   */
  createPayment(input: {
    roomId: string;
    packSlug: string;
    provider: PaymentProviderName;
    amountMinor: number;
    currency: "PHP";
    playerId: string;
    now: string;
  }): Promise<{ payment: Payment; reused: boolean } | "already_unlocked" | "not_in_lobby" | "pack_not_found">;

  attachCheckout(paymentId: string, checkoutId: string, checkoutUrl: string): Promise<void>;
  getPayment(paymentId: string): Promise<Payment | null>;
  getPaymentByCheckoutId(checkoutId: string): Promise<Payment | null>;
  listPendingPayments(roomId: string): Promise<Payment[]>;

  /**
   * Marks a provider-verified payment paid and unlocks its pack for the room —
   * exactly once. "duplicate" = paid, but the room already had the pack.
   */
  grantEntitlement(
    paymentId: string,
    providerPaymentId: string | null,
    now: string,
  ): Promise<"granted" | "already" | "duplicate" | "not_found">;

  /** Pack slugs the room has unlocked. */
  listEntitlements(roomId: string): Promise<string[]>;

  /** True the first time a provider event id is seen (webhook dedupe). */
  recordPaymentEvent(provider: PaymentProviderName, eventId: string, now: string): Promise<boolean>;
}
