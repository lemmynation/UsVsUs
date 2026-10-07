import type { Mode, Player, Room, RoomPreview, RoomView } from "@/types/room";
import {
  activePlayers,
  checkCanJoin,
  checkCanKick,
  checkCanStart,
  checkRoomJoinable,
  computeExpiresAt,
  effectiveStatus,
  generateJoinCode,
  isOnline,
  MODE_RULES,
  normalizeJoinCode,
  sanitizeNickname,
  sanitizeRoomName,
  type JoinError,
  type KickError,
  type Result,
  type StartError,
} from "./rules";
import type { RoomStore } from "./store";

export interface RoomServiceDeps {
  store: RoomStore;
  now: () => Date;
  randomInt: (maxExclusive: number) => number;
}

type MembershipError = "room_not_found" | "not_in_room" | "kicked";

export type CreateRoomError =
  "nickname_required" | "nickname_too_long" | "room_name_too_long" | "code_generation_failed";
export type JoinRoomError = JoinError | "invalid_code" | "room_not_found" | "nickname_required" | "nickname_too_long";
export type JoinInfo =
  | { kind: "member"; roomId: string }
  | { kind: "joinable"; preview: RoomPreview }
  | {
      kind: "unavailable";
      error: Exclude<JoinRoomError, "nickname_taken" | "nickname_required" | "nickname_too_long">;
      preview: RoomPreview | null;
    };

const MAX_CODE_ATTEMPTS = 5;

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

function toPreview(room: Room, players: Player[]): RoomPreview {
  return {
    joinCode: room.joinCode,
    mode: room.mode,
    name: room.name,
    playerCount: activePlayers(players).length,
    maxPlayers: MODE_RULES[room.mode].maxPlayers,
  };
}

export function createRoomService({ store, now, randomInt }: RoomServiceDeps) {
  /** Loads the room and the caller's player record, or explains why they can't act in it. */
  async function loadMembership(
    roomId: string,
    sessionHash: string | null,
  ): Promise<Result<{ room: Room; players: Player[]; me: Player }, MembershipError>> {
    const room = await store.getRoomById(roomId);
    if (!room) return fail("room_not_found");
    const players = await store.listPlayers(roomId);
    const me = sessionHash ? players.find((p) => p.sessionTokenHash === sessionHash) : undefined;
    if (!me) return fail("not_in_room");
    if (me.status === "kicked") return fail("kicked");
    return ok({ room, players, me });
  }

  return {
    async createRoom(input: {
      mode: Mode;
      nickname: string;
      roomName?: string | null;
      sessionHash: string;
    }): Promise<Result<{ room: Room; host: Player }, CreateRoomError>> {
      const nickname = sanitizeNickname(input.nickname);
      if (!nickname.ok) return nickname;
      const roomName = sanitizeRoomName(input.roomName);
      if (!roomName.ok) return roomName;

      const at = now();
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const created = await store.createRoom({
          joinCode: generateJoinCode(randomInt),
          mode: input.mode,
          name: roomName.value,
          expiresAt: computeExpiresAt(at),
          now: at.toISOString(),
          host: { nickname: nickname.value, sessionTokenHash: input.sessionHash },
        });
        if (created !== "join_code_taken") return ok(created);
      }
      return fail("code_generation_failed");
    },

    /** What the join screen should show for a code, from this visitor's point of view. */
    async getJoinInfo(rawCode: string, sessionHash: string | null): Promise<JoinInfo> {
      const code = normalizeJoinCode(rawCode);
      if (!code) return { kind: "unavailable", error: "invalid_code", preview: null };
      const room = await store.getRoomByCode(code);
      if (!room) return { kind: "unavailable", error: "room_not_found", preview: null };

      const players = await store.listPlayers(room.id);
      const preview = toPreview(room, players);
      const mine = sessionHash ? players.find((p) => p.sessionTokenHash === sessionHash) : undefined;
      if (mine?.status === "active" && effectiveStatus(room, now()) !== "EXPIRED") {
        return { kind: "member", roomId: room.id };
      }

      const check = checkRoomJoinable(room, players, sessionHash, now());
      if (!check.ok) return { kind: "unavailable", error: check.error, preview };
      return { kind: "joinable", preview };
    },

    async joinRoom(input: {
      code: string;
      nickname: string;
      sessionHash: string;
    }): Promise<Result<{ roomId: string; player: Player; alreadyMember: boolean }, JoinRoomError>> {
      const code = normalizeJoinCode(input.code);
      if (!code) return fail("invalid_code");
      const nickname = sanitizeNickname(input.nickname);
      if (!nickname.ok) return nickname;

      const room = await store.getRoomByCode(code);
      if (!room) return fail("room_not_found");
      const players = await store.listPlayers(room.id);

      // Re-joining from the same browser (refresh, re-opened link) is idempotent.
      const existing = players.find((p) => p.sessionTokenHash === input.sessionHash && p.status === "active");
      if (existing && effectiveStatus(room, now()) !== "EXPIRED") {
        return ok({ roomId: room.id, player: existing, alreadyMember: true });
      }

      const check = checkCanJoin(room, players, nickname.value, input.sessionHash, now());
      if (!check.ok) return check;

      const added = await store.addPlayer({
        roomId: room.id,
        nickname: nickname.value,
        sessionTokenHash: input.sessionHash,
        maxPlayers: MODE_RULES[room.mode].maxPlayers,
        now: now().toISOString(),
      });
      if (added === "room_not_open") return fail("room_closed");
      if (typeof added === "string") return fail(added);
      return ok({ roomId: room.id, player: added, alreadyMember: false });
    },

    /** Room state for a member. Also records that the member is still here. */
    async getRoomView(roomId: string, sessionHash: string | null): Promise<Result<RoomView, MembershipError>> {
      const membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const at = now();
      await store.touchPlayer(me.id, at.toISOString());
      me.lastSeenAt = at.toISOString();

      const rules = MODE_RULES[room.mode];
      return ok({
        room: {
          id: room.id,
          joinCode: room.joinCode,
          mode: room.mode,
          name: room.name,
          status: effectiveStatus(room, at),
          expiresAt: room.expiresAt,
          minPlayers: rules.minPlayers,
          maxPlayers: rules.maxPlayers,
        },
        players: activePlayers(players)
          .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
          .map((p) => ({ id: p.id, nickname: p.nickname, isHost: p.isHost, isOnline: isOnline(p, at) })),
        me: { playerId: me.id, isHost: me.isHost },
      });
    },

    async startGame(roomId: string, sessionHash: string): Promise<Result<null, MembershipError | StartError>> {
      const membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const check = checkCanStart(room, players, me, now());
      if (!check.ok) return check;
      const started = await store.startGame(room.id, MODE_RULES[room.mode].minPlayers);
      return started === "ok" ? ok(null) : fail(started);
    },

    async kickPlayer(
      roomId: string,
      sessionHash: string,
      targetPlayerId: string,
    ): Promise<Result<null, MembershipError | KickError>> {
      const membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;
      const { room, players, me } = membership.value;

      const target = players.find((p) => p.id === targetPlayerId);
      const check = checkCanKick(room, me, target, now());
      if (!check.ok) return check;
      await store.kickPlayer(targetPlayerId);
      return ok(null);
    },

    async leaveRoom(roomId: string, sessionHash: string): Promise<Result<null, MembershipError>> {
      const membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;
      await store.removePlayer(membership.value.me.id);
      return ok(null);
    },
  };
}

export type RoomService = ReturnType<typeof createRoomService>;
