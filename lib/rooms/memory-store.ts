import { randomUUID } from "node:crypto";
import type { Player, Room } from "@/types/room";
import { nextHost } from "./rules";
import type { AnalyticsEvent, RoomStore } from "./store";

/**
 * In-process store for local development without Supabase and for tests.
 * Single-threaded JS makes each method atomic. Data is lost on restart.
 */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  private players = new Map<string, Player>();
  readonly events: AnalyticsEvent[] = [];

  async createRoom(input: Parameters<RoomStore["createRoom"]>[0]) {
    for (const r of this.rooms.values()) {
      if (r.joinCode === input.joinCode) return "join_code_taken" as const;
    }
    const room: Room = {
      id: randomUUID(),
      joinCode: input.joinCode,
      mode: input.mode,
      name: input.name,
      hostPlayerId: null,
      status: "LOBBY",
      selectedPackId: null,
      createdAt: input.now,
      expiresAt: input.expiresAt,
    };
    const host: Player = {
      id: randomUUID(),
      roomId: room.id,
      nickname: input.host.nickname,
      sessionTokenHash: input.host.sessionTokenHash,
      isHost: true,
      status: "active",
      joinedAt: input.now,
      lastSeenAt: input.now,
    };
    room.hostPlayerId = host.id;
    this.rooms.set(room.id, room);
    this.players.set(host.id, host);
    return { room: { ...room }, host: { ...host } };
  }

  async getRoomById(id: string) {
    const room = this.rooms.get(id);
    return room ? { ...room } : null;
  }

  async getRoomByCode(joinCode: string) {
    for (const r of this.rooms.values()) {
      if (r.joinCode === joinCode) return { ...r };
    }
    return null;
  }

  async listPlayers(roomId: string) {
    return [...this.players.values()].filter((p) => p.roomId === roomId).map((p) => ({ ...p }));
  }

  async addPlayer(input: Parameters<RoomStore["addPlayer"]>[0]) {
    const room = this.rooms.get(input.roomId);
    if (!room || room.status !== "LOBBY" || new Date(room.expiresAt) <= new Date(input.now)) {
      return "room_not_open" as const;
    }
    const active = [...this.players.values()].filter((p) => p.roomId === room.id && p.status === "active");
    if (active.length >= input.maxPlayers) return "room_full" as const;
    if (active.some((p) => p.nickname.toLowerCase() === input.nickname.toLowerCase())) {
      return "nickname_taken" as const;
    }
    const player: Player = {
      id: randomUUID(),
      roomId: room.id,
      nickname: input.nickname,
      sessionTokenHash: input.sessionTokenHash,
      isHost: false,
      status: "active",
      joinedAt: input.now,
      lastSeenAt: input.now,
    };
    this.players.set(player.id, player);
    return { ...player };
  }

  async startGame(roomId: string, minPlayers: number) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "LOBBY") return "not_in_lobby" as const;
    const active = [...this.players.values()].filter((p) => p.roomId === roomId && p.status === "active");
    if (active.length < minPlayers) return "not_enough_players" as const;
    room.status = "IN_GAME";
    return "ok" as const;
  }

  async kickPlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (player) player.status = "kicked";
  }

  async removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    const room = this.rooms.get(player.roomId);
    const roomPlayers = [...this.players.values()].filter((p) => p.roomId === player.roomId);
    this.players.delete(playerId);
    if (!room || !player.isHost) return;

    const successor = nextHost(roomPlayers, playerId);
    if (successor) {
      this.players.get(successor.id)!.isHost = true;
      room.hostPlayerId = successor.id;
    } else {
      room.hostPlayerId = null;
      if (room.status === "LOBBY" || room.status === "IN_GAME") room.status = "ABANDONED";
    }
  }

  async touchPlayer(playerId: string, now: string) {
    const player = this.players.get(playerId);
    if (player) player.lastSeenAt = now;
  }

  async recordEvent(event: AnalyticsEvent) {
    this.events.push(event);
  }

  /** Test helper: force a room's expiry. */
  _setExpiresAt(roomId: string, expiresAt: string) {
    const room = this.rooms.get(roomId);
    if (room) room.expiresAt = expiresAt;
  }
}
