import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionHistory } from "@/lib/game/question-picker";
import { questionSchema } from "@/lib/game/questions";
import type { GamePhase, GameResponse, GameRound, GameSession, GameType, Question } from "@/types/game";
import type { Mode, Player, PlayerStatus, Room, RoomStatus } from "@/types/room";
import type { AnalyticsEvent, RoomStore } from "./store";

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
}

interface RoundRow {
  id: string;
  game_session_id: string;
  round_index: number;
  game_type: GameType;
  question_ids: string[];
}

interface ResponseRow {
  id: string;
  game_session_id: string;
  round_id: string;
  question_id: string;
  player_id: string;
  answer: { optionId: string };
  submitted_at: string;
}

const toSession = (s: SessionRow): GameSession => ({
  id: s.id,
  roomId: s.room_id,
  status: s.status,
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
    });
    check(error, "start_game");
    const result = data as { error?: "not_in_lobby" | "not_enough_players"; session?: SessionRow; rounds?: RoundRow[] };
    if (result.error) return result.error;
    return { session: toSession(result.session!), rounds: result.rounds!.map(toRound) };
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
    return { session: toSession(session as SessionRow), rounds: (rounds as RoundRow[]).map(toRound) };
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
    return result.error ? result.error : toSession(result.session!);
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
      .select("id, game_type, modes, category, intensity, prompt, options, active");
    check(error, "getQuestions");
    const questions: Question[] = [];
    for (const row of data ?? []) {
      // Skip rows for game types this build doesn't support yet rather than failing the whole game.
      const parsed = questionSchema.safeParse({ ...row, gameType: row.game_type });
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
    const { error } = await this.db.from("events").insert({
      anonymous_session_id: event.anonymousSessionId,
      room_id: event.roomId,
      event_name: event.eventName,
      properties: event.properties,
      created_at: event.createdAt,
    });
    check(error, "recordEvent");
  }
}
