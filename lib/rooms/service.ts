import type { GameService } from "@/lib/game/service";
import { claimOwnedPacksSafely } from "@/lib/premium/owned";
import type { PremiumView } from "@/types/premium";
import type { Experience, Mode, Player, Room, RoomPreview, RoomView } from "@/types/room";
import type { ChaosPlayerView } from "@/lib/chaos/projections";
import { loadMembership as loadMembershipFrom, type MembershipError } from "./membership";
import {
  activePlayers,
  checkCanJoin,
  checkCanKick,
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
} from "./rules";
import type { RoomStore } from "./store";

export interface RoomServiceDeps {
  store: RoomStore;
  now: () => Date;
  randomInt: (maxExclusive: number) => number;
  /** Game layer: in-game views, host hand-off, auto-reveal when the roster changes. */
  game?: GameService;
  /** Premium layer: which packs exist for the room and which are unlocked. */
  premium?: { view(room: Room): Promise<PremiumView> };
  /** Chain Reactions layer: the player's match view, and moving on when someone leaves. */
  chaos?: {
    viewFor(room: Room, players: Player[], me: Player): Promise<ChaosPlayerView | null>;
    afterRosterChange(roomId: string): Promise<boolean>;
    /** Moves a step on once its overtime is up (any member's refresh can do it). */
    catchUp(room: Room, players: Player[]): Promise<boolean>;
  };
}

const NO_PREMIUM: PremiumView = { enabled: false, packs: [], pendingCheckout: false };

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
    experience: room.experience,
    name: room.name,
    hostNickname: activePlayers(players).find((p) => p.id === room.hostPlayerId)?.nickname ?? null,
    playerCount: activePlayers(players).length,
    maxPlayers: MODE_RULES[room.mode].maxPlayers,
  };
}

export function createRoomService({ store, now, randomInt, game, premium, chaos }: RoomServiceDeps) {
  const loadMembership = (roomId: string, sessionHash: string | null) => loadMembershipFrom(store, roomId, sessionHash);

  return {
    async createRoom(input: {
      mode: Mode;
      nickname: string;
      roomName?: string | null;
      sessionHash: string;
      experience?: Experience;
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
          experience: input.experience,
        });
        if (created !== "join_code_taken") {
          // Packs follow your phone: whatever the host bought before is unlocked here too.
          await claimOwnedPacksSafely(store, created.room.id, input.sessionHash, at.toISOString());
          return ok(created);
        }
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
      let membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;

      const at = now();
      await store.touchPlayer(membership.value.me.id, at.toISOString());
      membership.value.me.lastSeenAt = at.toISOString();

      // Any member's refresh can notice a host who has gone quiet mid-game.
      if (game && (await game.passHostIfAway(membership.value.room, membership.value.players))) {
        membership = await loadMembership(roomId, sessionHash);
        if (!membership.ok) return membership;
      }
      const { room, players, me } = membership.value;
      await chaos?.catchUp(room, players);

      const rules = MODE_RULES[room.mode];
      return ok({
        room: {
          id: room.id,
          joinCode: room.joinCode,
          mode: room.mode,
          experience: room.experience,
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
        game: game ? await game.viewFor(room, players, me) : null,
        // Packs are only chosen in the lobby; skip the lookups on every in-game refresh.
        premium: premium && room.status === "LOBBY" ? await premium.view(room) : NO_PREMIUM,
        chaos: chaos ? await chaos.viewFor(room, players, me) : null,
      });
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
      await game?.afterRosterChange(room.id);
      await chaos?.afterRosterChange(room.id);
      return ok(null);
    },

    async leaveRoom(roomId: string, sessionHash: string): Promise<Result<null, MembershipError>> {
      const membership = await loadMembership(roomId, sessionHash);
      if (!membership.ok) return membership;
      await store.removePlayer(membership.value.me.id);
      if (membership.value.me.isHost) {
        // The new host's own packs come with them.
        const [room, players] = await Promise.all([store.getRoomById(roomId), store.listPlayers(roomId)]);
        const newHost = players.find((p) => p.id === room?.hostPlayerId);
        if (newHost) await claimOwnedPacksSafely(store, roomId, newHost.sessionTokenHash, now().toISOString());
      }
      await game?.afterRosterChange(roomId);
      await chaos?.afterRosterChange(roomId);
      return ok(null);
    },
  };
}

export type RoomService = ReturnType<typeof createRoomService>;
