import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionHistory } from "@/lib/game/question-picker";
import { questionSchema } from "@/lib/game/questions";
import type {
  GamePhase,
  GameResponse,
  GameRound,
  GameSession,
  GameType,
  PlayerAnswer,
  Question,
  ScoreEntry,
  WrappedReport,
} from "@/types/game";
import type { Payment, PaymentProviderName, PaymentStatus } from "@/types/premium";
import type { Mode, Player, PlayerStatus, Room, RoomStatus } from "@/types/room";
import type { AnalyticsEvent, CleanupCutoffs, CleanupResult, FeedbackRating, RoomStore } from "./store";

interface RoomRow {
  id: string;
  join_code: string;
  mode: Mode;
  name: string | null;
  host_player_id: string | null;
  status: RoomStatus;
  selected_pack_id: string | null;
  created_at: string;
  expires_at: string;
}

interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  session_token_hash: string;
  is_host: boolean;
  status: PlayerStatus;
  joined_at: string;
  last_seen_at: string;
}

const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  joinCode: r.join_code,
  mode: r.mode,
  name: r.name,
  hostPlayerId: r.host_player_id,
  status: r.status,
  selectedPackId: r.selected_pack_id,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

const toPlayer = (p: PlayerRow): Player => ({
  id: p.id,
  roomId: p.room_id,
  nickname: p.nickname,
  sessionTokenHash: p.session_token_hash,
  isHost: p.is_host,
  status: p.status,
  joinedAt: p.joined_at,
  lastSeenAt: p.last_seen_at,
});

interface SessionRow {
  id: string;
  room_id: string;
  status: "active" | "finished";
  phase: GamePhase;
  round_index: number;
  question_index: number;
  state_version: number;
  phase_started_at: string;
  started_at: string;
  ended_at: string | null;
  pack_id: string | null;
}

interface PaymentRow {
  id: string;
  room_id: string | null;
  pack_id: string;
  provider: PaymentProviderName;
  provider_checkout_id: string | null;
  checkout_url: string | null;
  provider_payment_id: string | null;
  amount_minor: number;
  currency: "PHP";
  status: PaymentStatus;
  created_by_player_id: string | null;
  created_at: string;
  paid_at: string | null;
  pack?: { slug: string } | null;
}

const toPayment = (r: PaymentRow, packSlug?: string): Payment => ({
  id: r.id,
  roomId: r.room_id,
  packSlug: packSlug ?? r.pack?.slug ?? "",
  provider: r.provider,
  checkoutId: r.provider_checkout_id,
  checkoutUrl: r.checkout_url,
  providerPaymentId: r.provider_payment_id,
  amountMinor: r.amount_minor,
  currency: r.currency,
  status: r.status,
  createdByPlayerId: r.created_by_player_id,
  createdAt: r.created_at,
  paidAt: r.paid_at,
});

const PAYMENT_COLUMNS = "*, pack:packs(slug)";

/** Pack ids never change slug; cache the lookup per server instance. */
const packSlugCache = new Map<string, string>();

interface RoundRow {
  id: string;
  game_session_id: string;
  round_index: number;
  game_type: GameType;
  question_ids: string[];
  subject_player_ids: Array<string | null> | null;
}

interface ResponseRow {
  id: string;
  game_session_id: string;
  round_id: string;
  question_id: string;
  player_id: string;
  answer: PlayerAnswer;
  submitted_at: string;
}

interface ScoreRow {
  player_id: string;
  round_index: number;
  question_index: number;
  points: number;
  metadata: { award?: string };
}

const toSession = (s: SessionRow, packSlug: string | null): GameSession => ({
  id: s.id,
  roomId: s.room_id,
  status: s.status,
  packSlug,
  phase: s.phase,
  roundIndex: s.round_index,
  questionIndex: s.question_index,
  stateVersion: s.state_version,
  phaseStartedAt: s.phase_started_at,
  startedAt: s.started_at,
  endedAt: s.ended_at,
});

const toRound = (r: RoundRow): GameRound => ({
  id: r.id,
  sessionId: r.game_session_id,
  roundIndex: r.round_index,
  gameType: r.game_type,
  questionIds: r.question_ids,
  subjectPlayerIds: r.subject_player_ids ?? r.question_ids.map(() => null),
});

const toResponse = (r: ResponseRow): GameResponse => ({
  id: r.id,
  sessionId: r.game_session_id,
  roundId: r.round_id,
  questionId: r.question_id,
  playerId: r.player_id,
  answer: r.answer,
  submittedAt: r.submitted_at,
});

/** Questions change rarely; cache per server instance. */
const QUESTION_CACHE_MS = 5 * 60_000;
let questionCache: { at: number; questions: Question[] } | undefined;

const ROOM_COLUMNS = "id, join_code, mode, name, host_player_id, status, selected_pack_id, created_at, expires_at";
const PLAYER_COLUMNS = "id, room_id, nickname, session_token_hash, is_host, status, joined_at, last_seen_at";

function check(error: { message: string } | null, op: string) {
  if (error) throw new Error(`Supabase ${op} failed: ${error.message}`);
}

export class SupabaseRoomStore implements RoomStore {
  constructor(private db: SupabaseClient) {}

  private async packSlugOf(packId: string | null): Promise<string | null> {
    if (!packId) return null;
    const cached = packSlugCache.get(packId);
    if (cached) return cached;
    const { data, error } = await this.db.from("packs").select("slug").eq("id", packId).maybeSingle();
    check(error, "packSlugOf");
    if (data) packSlugCache.set(packId, data.slug as string);
    return (data?.slug as string | undefined) ?? null;
  }

  async createRoom(input: Parameters<RoomStore["createRoom"]>[0]) {
    const { data, error } = await this.db.rpc("create_room", {
      p_join_code: input.joinCode,
      p_mode: input.mode,
      p_name: input.name,
      p_expires_at: input.expiresAt,
      p_now: input.now,
      p_nickname: input.host.nickname,
      p_session_token_hash: input.host.sessionTokenHash,
    });
    if (error?.code === "23505") return "join_code_taken" as const;
    check(error, "create_room");
    const result = data as { room: RoomRow; host: PlayerRow };
    return { room: toRoom(result.room), host: toPlayer(result.host) };
  }

  async getRoomById(id: string) {
    const { data, error } = await this.db.from("rooms").select(ROOM_COLUMNS).eq("id", id).maybeSingle();
    check(error, "getRoomById");
    return data ? toRoom(data as RoomRow) : null;
  }

  async getRoomByCode(joinCode: string) {
    const { data, error } = await this.db.from("rooms").select(ROOM_COLUMNS).eq("join_code", joinCode).maybeSingle();
    check(error, "getRoomByCode");
    return data ? toRoom(data as RoomRow) : null;
  }

  async listPlayers(roomId: string) {
    const { data, error } = await this.db
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });
    check(error, "listPlayers");
    return (data as PlayerRow[]).map(toPlayer);
  }

  async addPlayer(input: Parameters<RoomStore["addPlayer"]>[0]) {
    const { data, error } = await this.db.rpc("join_room", {
      p_room_id: input.roomId,
      p_nickname: input.nickname,
      p_session_token_hash: input.sessionTokenHash,
      p_max_players: input.maxPlayers,
      p_now: input.now,
    });
    check(error, "join_room");
    const result = data as { error?: "room_full" | "room_not_open" | "nickname_taken"; player?: PlayerRow };
    if (result.error) return result.error;
    return toPlayer(result.player!);
  }

  async startGame(input: Parameters<RoomStore["startGame"]>[0]) {
    const { data, error } = await this.db.rpc("start_game", {
      p_room_id: input.roomId,
      p_min_players: input.minPlayers,
      p_rounds: input.rounds,
      p_now: input.now,
      p_pack_slug: input.packSlug ?? null,
    });
    check(error, "start_game");
    const result = data as {
      error?: "not_in_lobby" | "not_enough_players" | "pack_locked";
      session?: SessionRow;
      rounds?: RoundRow[];
    };
    if (result.error) return result.error;
    return { session: toSession(result.session!, input.packSlug ?? null), rounds: result.rounds!.map(toRound) };
  }

  async getLatestGame(roomId: string) {
    const { data: session, error } = await this.db
      .from("game_sessions")
      .select("*")
      .eq("room_id", roomId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(error, "getLatestGame");
    if (!session) return null;
    const { data: rounds, error: roundsError } = await this.db
      .from("rounds")
      .select("*")
      .eq("game_session_id", (session as SessionRow).id)
      .order("round_index", { ascending: true });
    check(roundsError, "getLatestGame rounds");
    const row = session as SessionRow;
    return { session: toSession(row, await this.packSlugOf(row.pack_id)), rounds: (rounds as RoundRow[]).map(toRound) };
  }

  async listResponses(roundId: string, questionId: string) {
    const { data, error } = await this.db
      .from("responses")
      .select("*")
      .eq("round_id", roundId)
      .eq("question_id", questionId)
      .order("submitted_at", { ascending: true });
    check(error, "listResponses");
    return (data as ResponseRow[]).map(toResponse);
  }

  async listSessionResponses(sessionId: string) {
    const { data, error } = await this.db
      .from("responses")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("submitted_at", { ascending: true });
    check(error, "listSessionResponses");
    return (data as ResponseRow[]).map(toResponse);
  }

  async getWrapped(sessionId: string) {
    const { data, error } = await this.db
      .from("wrapped_reports")
      .select("report")
      .eq("game_session_id", sessionId)
      .maybeSingle();
    check(error, "getWrapped");
    return data ? (data.report as WrappedReport) : null;
  }

  async listRoomWrapped(roomId: string) {
    const { data, error } = await this.db
      .from("wrapped_reports")
      .select("report, session:game_sessions!inner(room_id, started_at)")
      .eq("session.room_id", roomId);
    check(error, "listRoomWrapped");
    return (data as unknown as Array<{ report: WrappedReport; session: { started_at: string } }>)
      .sort((a, b) => a.session.started_at.localeCompare(b.session.started_at))
      .map((r) => r.report);
  }

  async saveWrapped(sessionId: string, report: WrappedReport, now: string) {
    const { data, error } = await this.db.rpc("save_wrapped", {
      p_session_id: sessionId,
      p_report: report,
      p_now: now,
    });
    check(error, "save_wrapped");
    return data as WrappedReport;
  }

  async listScores(sessionId: string) {
    const { data, error } = await this.db
      .from("scores")
      .select("player_id, round_index, question_index, points, metadata")
      .eq("game_session_id", sessionId);
    check(error, "listScores");
    return (data as ScoreRow[]).map((r): ScoreEntry => ({
      playerId: r.player_id,
      roundIndex: r.round_index,
      questionIndex: r.question_index,
      points: r.points,
      award: r.metadata?.award ?? null,
    }));
  }

  async recordScores(sessionId: string, entries: ScoreEntry[]) {
    if (entries.length === 0) return;
    const { error } = await this.db.rpc("record_scores", { p_session_id: sessionId, p_scores: entries });
    check(error, "record_scores");
  }

  async submitResponse(input: Parameters<RoomStore["submitResponse"]>[0]) {
    const { data, error } = await this.db.rpc("submit_response", {
      p_session_id: input.sessionId,
      p_round_id: input.roundId,
      p_round_index: input.roundIndex,
      p_question_index: input.questionIndex,
      p_question_id: input.questionId,
      p_player_id: input.playerId,
      p_answer: input.answer,
      p_now: input.now,
    });
    check(error, "submit_response");
    return data as "ok" | "duplicate" | "not_open";
  }

  async advanceGame(input: Parameters<RoomStore["advanceGame"]>[0]) {
    const { data, error } = await this.db.rpc("advance_game", {
      p_session_id: input.sessionId,
      p_expected_version: input.expectedVersion,
      p_phase: input.next.phase,
      p_round_index: input.next.roundIndex,
      p_question_index: input.next.questionIndex,
      p_now: input.now,
    });
    check(error, "advance_game");
    const result = data as { error?: "stale"; session?: SessionRow };
    if (result.error) return result.error;
    return toSession(result.session!, await this.packSlugOf(result.session!.pack_id));
  }

  async reopenRoom(input: { roomId: string; expiresAt: string }) {
    const { data, error } = await this.db.rpc("reopen_room", {
      p_room_id: input.roomId,
      p_expires_at: input.expiresAt,
    });
    check(error, "reopen_room");
    return data === "reopened" ? ("reopened" as const) : ("not_wrapped" as const);
  }

  async transferHost(roomId: string, fromPlayerId: string, toPlayerId: string) {
    const { data, error } = await this.db.rpc("transfer_host", {
      p_room_id: roomId,
      p_from: fromPlayerId,
      p_to: toPlayerId,
    });
    check(error, "transfer_host");
    return data === true;
  }

  async getQuestions() {
    if (questionCache && Date.now() - questionCache.at < QUESTION_CACHE_MS) return questionCache.questions;
    const { data, error } = await this.db
      .from("questions")
      // Inactive rows too: a game already in progress may still be on one. The picker skips them.
      // The pack slug matters: without it a premium question would look like a free one.
      .select("id, game_type, modes, category, intensity, prompt, options, active, award, pack:packs(slug)");
    check(error, "getQuestions");
    const questions: Question[] = [];
    for (const row of data ?? []) {
      // Skip rows for game types this build doesn't support yet rather than failing the whole game.
      const pack = (row as unknown as { pack: { slug: string } | null }).pack;
      const parsed = questionSchema.safeParse({ ...row, gameType: row.game_type, pack: pack?.slug ?? null });
      if (parsed.success) questions.push(parsed.data);
    }
    questionCache = { at: Date.now(), questions };
    return questions;
  }

  async getQuestionHistory(sessionTokenHashes: string[]) {
    const { data, error } = await this.db.rpc("question_history_for", { p_hashes: sessionTokenHashes });
    check(error, "question_history_for");
    const history = new Map<string, QuestionHistory>();
    for (const row of (data ?? []) as Array<{ question_id: string; seen_count: number; last_seen_at: string }>) {
      history.set(row.question_id, { seenCount: Number(row.seen_count), lastSeenAt: row.last_seen_at });
    }
    return history;
  }

  async recordQuestionSeen(sessionTokenHashes: string[], questionId: string, now: string) {
    const { error } = await this.db.rpc("record_question_seen", {
      p_hashes: sessionTokenHashes,
      p_question_id: questionId,
      p_now: now,
    });
    check(error, "record_question_seen");
  }

  async createPayment(input: Parameters<RoomStore["createPayment"]>[0]) {
    const { data, error } = await this.db.rpc("create_payment", {
      p_room_id: input.roomId,
      p_pack_slug: input.packSlug,
      p_provider: input.provider,
      p_amount_minor: input.amountMinor,
      p_currency: input.currency,
      p_player_id: input.playerId,
      p_now: input.now,
    });
    check(error, "create_payment");
    const result = data as {
      error?: "already_unlocked" | "not_in_lobby" | "pack_not_found";
      payment?: PaymentRow;
      reused?: boolean;
    };
    if (result.error) return result.error;
    return { payment: toPayment(result.payment!, input.packSlug), reused: result.reused === true };
  }

  async attachCheckout(paymentId: string, checkoutId: string, checkoutUrl: string) {
    const { error } = await this.db
      .from("payments")
      .update({ provider_checkout_id: checkoutId, checkout_url: checkoutUrl })
      .eq("id", paymentId)
      .is("provider_checkout_id", null);
    check(error, "attachCheckout");
  }

  async getPayment(paymentId: string) {
    const { data, error } = await this.db.from("payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle();
    check(error, "getPayment");
    return data ? toPayment(data as PaymentRow) : null;
  }

  async getPaymentByCheckoutId(checkoutId: string) {
    const { data, error } = await this.db
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("provider_checkout_id", checkoutId)
      .maybeSingle();
    check(error, "getPaymentByCheckoutId");
    return data ? toPayment(data as PaymentRow) : null;
  }

  async listPendingPayments(roomId: string) {
    const { data, error } = await this.db
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("room_id", roomId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    check(error, "listPendingPayments");
    return (data as PaymentRow[]).map((r) => toPayment(r));
  }

  async grantEntitlement(paymentId: string, providerPaymentId: string | null, now: string) {
    const { data, error } = await this.db.rpc("grant_entitlement", {
      p_payment_id: paymentId,
      p_provider_payment_id: providerPaymentId,
      p_now: now,
    });
    check(error, "grant_entitlement");
    return data as "granted" | "already" | "duplicate" | "not_found";
  }

  async listEntitlements(roomId: string) {
    const { data, error } = await this.db.from("entitlements").select("pack:packs(slug)").eq("room_id", roomId);
    check(error, "listEntitlements");
    return (data as unknown as Array<{ pack: { slug: string } | null }>).flatMap((r) => (r.pack ? [r.pack.slug] : []));
  }

  async claimOwnedPacks(roomId: string, sessionTokenHash: string, now: string) {
    const { data, error } = await this.db.rpc("claim_owned_packs", {
      p_room_id: roomId,
      p_session_token_hash: sessionTokenHash,
      p_now: now,
    });
    check(error, "claim_owned_packs");
    return typeof data === "number" ? data : 0;
  }

  async recordPaymentEvent(provider: PaymentProviderName, eventId: string, now: string) {
    const { data, error } = await this.db.rpc("record_payment_event", {
      p_provider: provider,
      p_event_id: eventId,
      p_now: now,
    });
    check(error, "record_payment_event");
    return data === true;
  }

  async kickPlayer(playerId: string) {
    const { error } = await this.db.from("players").update({ status: "kicked" }).eq("id", playerId);
    check(error, "kickPlayer");
  }

  async removePlayer(playerId: string) {
    const { error } = await this.db.rpc("leave_room", { p_player_id: playerId });
    check(error, "leave_room");
  }

  async touchPlayer(playerId: string, now: string) {
    const { error } = await this.db.from("players").update({ last_seen_at: now }).eq("id", playerId);
    check(error, "touchPlayer");
  }

  async recordEvent(event: AnalyticsEvent) {
    const row = {
      anonymous_session_id: event.anonymousSessionId,
      room_id: event.roomId,
      event_name: event.eventName,
      properties: event.properties,
      created_at: event.createdAt,
    };
    let { error } = await this.db.from("events").insert(row);
    // A client may name a room that doesn't exist (or was cleaned up): keep the event, drop the link.
    if (error?.code === "23503" && row.room_id)
      ({ error } = await this.db.from("events").insert({ ...row, room_id: null }));
    check(error, "recordEvent");
  }

  async listEvents(sinceIso: string, limit: number) {
    const PAGE = 1000; // PostgREST caps a response at 1000 rows
    const out: AnalyticsEvent[] = [];
    while (out.length < limit) {
      const from = out.length;
      const to = Math.min(limit, from + PAGE) - 1;
      const { data, error } = await this.db
        .from("events")
        .select("anonymous_session_id, room_id, event_name, properties, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      check(error, "listEvents");
      const rows = data as Array<{
        anonymous_session_id: string | null;
        room_id: string | null;
        event_name: string;
        properties: Record<string, unknown> | null;
        created_at: string;
      }>;
      for (const r of rows)
        out.push({
          anonymousSessionId: r.anonymous_session_id,
          roomId: r.room_id,
          eventName: r.event_name,
          properties: r.properties ?? {},
          createdAt: new Date(r.created_at).toISOString(),
        });
      if (rows.length < to - from + 1) break;
    }
    return out;
  }

  async cleanupExpiredData(cutoffs: CleanupCutoffs) {
    const { data, error } = await this.db.rpc("cleanup_expired_data", {
      p_rooms_before: cutoffs.rooms,
      p_history_before: cutoffs.questionHistory,
      p_events_before: cutoffs.events,
      p_payment_events_before: cutoffs.paymentEvents,
      p_feedback_before: cutoffs.feedback,
    });
    check(error, "cleanup_expired_data");
    const r = data as Partial<CleanupResult> | null;
    return {
      rooms: r?.rooms ?? 0,
      questionHistory: r?.questionHistory ?? 0,
      events: r?.events ?? 0,
      paymentEvents: r?.paymentEvents ?? 0,
      feedback: r?.feedback ?? 0,
    };
  }

  async hitRateLimit(key: string, max: number, windowMs: number, now: string) {
    const { data, error } = await this.db.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_ms: windowMs,
      p_now: now,
    });
    check(error, "rate_limit_hit");
    return data === true;
  }

  async saveFeedback(input: Parameters<RoomStore["saveFeedback"]>[0]) {
    const { error } = await this.db.from("feedback").upsert(
      {
        room_id: input.roomId,
        game_session_id: input.sessionId,
        player_id: input.playerId,
        mode: input.mode,
        rating: input.rating,
        comment: input.comment,
        updated_at: input.now,
      },
      { onConflict: "game_session_id,player_id" },
    );
    check(error, "saveFeedback");
  }

  async listFeedback(sinceIso: string, limit: number) {
    const { data, error } = await this.db
      .from("feedback")
      .select("mode, rating, comment, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 1000));
    check(error, "listFeedback");
    return (data as Array<{ mode: Mode; rating: FeedbackRating; comment: string | null; created_at: string }>).map(
      (r) => ({ mode: r.mode, rating: r.rating, comment: r.comment, createdAt: new Date(r.created_at).toISOString() }),
    );
  }
}
