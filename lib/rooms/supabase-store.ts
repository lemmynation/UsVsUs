import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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

  async startGame(roomId: string, minPlayers: number) {
    const { data, error } = await this.db.rpc("start_room", { p_room_id: roomId, p_min_players: minPlayers });
    check(error, "start_room");
    return data as "ok" | "not_in_lobby" | "not_enough_players";
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
