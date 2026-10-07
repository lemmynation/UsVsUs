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

  /** LOBBY → IN_GAME, re-checking status and player count atomically. */
  startGame(roomId: string, minPlayers: number): Promise<"ok" | "not_in_lobby" | "not_enough_players">;

  kickPlayer(playerId: string): Promise<void>;

  /** Deletes the player; hands host to the earliest remaining player, or abandons an empty room. */
  removePlayer(playerId: string): Promise<void>;

  touchPlayer(playerId: string, now: string): Promise<void>;

  recordEvent(event: AnalyticsEvent): Promise<void>;
}
