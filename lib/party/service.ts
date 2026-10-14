/**
 * Party Screen (UsVsUs 4.2 Sprint 2): pairing a TV to a Mutation Machine room and
 * what that TV may see. The TV is a reader only: nothing in a match waits for it,
 * and its view is built from public data alone (lib/chaos/projections.ts
 * `spectatorView`). No Next.js or Supabase here.
 */
import type { ChaosContent } from "@/lib/chaos/content";
import { spectatorView } from "@/lib/chaos/projections";
import { chaosWrappedFor } from "@/lib/chaos/service";
import { loadMembership, type MembershipError } from "@/lib/rooms/membership";
import { activePlayers, effectiveStatus, isOnline, MODE_RULES, type Result } from "@/lib/rooms/rules";
import type { RoomStore } from "@/lib/rooms/store";
import { generateSessionToken, hashSessionToken } from "@/lib/session-token";
import type { ChaosContribution } from "@/types/chaos";
import type { DisplaySummary, SpectatorState, SpectatorView } from "@/types/party";
import type { Player, Room } from "@/types/room";
import {
  DISPLAY_ONLINE_MS,
  DISPLAY_TOUCH_MS,
  generatePairingCode,
  hashPairingCode,
  MAX_DISPLAYS_PER_ROOM,
  normalizePairingCode,
  PAIRING_CODE_TTL_MS,
} from "./pairing";

export interface PartyServiceDeps {
  store: RoomStore;
  content: ChaosContent;
  now: () => Date;
  randomInt: (maxExclusive: number) => number;
}

export type PairError =
  MembershipError | "not_host" | "wrong_experience" | "invalid_pairing_code" | "too_many_displays" | "room_closed";

const MAX_CODE_ATTEMPTS = 5;
const LIVE = new Set(["LOBBY", "IN_GAME", "WRAPPED"]);

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

export function createPartyService({ store, content, now, randomInt }: PartyServiceDeps) {
  async function asHost(roomId: string, sessionHash: string) {
    const membership = await loadMembership(store, roomId, sessionHash);
    if (!membership.ok) return membership;
    const { room, me } = membership.value;
    if (!me.isHost || room.hostPlayerId !== me.id) return fail("not_host" as const);
    return ok(membership.value);
  }

  async function viewOf(room: Room, players: Player[]): Promise<SpectatorView> {
    const at = now();
    const active = activePlayers(players).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    const status = effectiveStatus(room, at);
    const rules = MODE_RULES[room.mode];
    let chaos: SpectatorView["chaos"] = null;
    // In the lobby (a rematch's included) the TV shows who's here, not the last match.
    if (status === "IN_GAME" || status === "WRAPPED") {
      const match = await store.getLatestChainMatch(room.id);
      if (match) {
        const [contributions, wrapped] = await Promise.all([
          store.listContributions(match.id),
          match.phase === "RECAP" ? chaosWrappedFor({ store, content }, match, room, players) : Promise.resolve(null),
        ]);
        chaos = spectatorView({
          match,
          contributions: contributions as ChaosContribution[],
          wrapped,
          activePlayerIds: new Set(active.map((p) => p.id)),
          content,
        });
      }
    }
    return {
      room: {
        id: room.id,
        joinCode: room.joinCode,
        mode: room.mode,
        name: room.name,
        status,
        minPlayers: rules.minPlayers,
        maxPlayers: rules.maxPlayers,
      },
      players: active.map((p) => ({ id: p.id, nickname: p.nickname, isHost: p.isHost, isOnline: isOnline(p, at) })),
      chaos,
    };
  }

  return {
    /** A TV asks for a code. Returns the cookie token for the TV; only its hash is stored. */
    async request(): Promise<Result<{ code: string; token: string; expiresAt: string }, "code_generation_failed">> {
      const at = now();
      const expiresAt = new Date(at.getTime() + PAIRING_CODE_TTL_MS).toISOString();
      const token = generateSessionToken();
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = generatePairingCode(randomInt);
        const created = await store.createDisplay({
          pairingCodeHash: hashPairingCode(code),
          tokenHash: hashSessionToken(token),
          expiresAt,
          now: at.toISOString(),
        });
        if (created !== "code_taken") return ok({ code, token, expiresAt });
      }
      return fail("code_generation_failed");
    },

    /** The host types the code a TV shows. */
    async pair(
      roomId: string,
      sessionHash: string,
      rawCode: string,
    ): Promise<Result<{ displayId: string }, PairError>> {
      const host = await asHost(roomId, sessionHash);
      if (!host.ok) return host;
      const { room, me } = host.value;
      if (room.experience !== "chain_reactions") return fail("wrong_experience");
      const code = normalizePairingCode(rawCode);
      if (!code) return fail("invalid_pairing_code");
      const approved = await store.approveDisplay({
        roomId,
        pairingCodeHash: hashPairingCode(code),
        playerId: me.id,
        maxDisplays: MAX_DISPLAYS_PER_ROOM,
        now: now().toISOString(),
      });
      if (approved === "invalid_code") return fail("invalid_pairing_code");
      if (typeof approved === "string") return fail(approved);
      return ok({ displayId: approved.id });
    },

    /** The room's TVs, for the host's phone. */
    async list(roomId: string, sessionHash: string): Promise<Result<DisplaySummary[], MembershipError | "not_host">> {
      const host = await asHost(roomId, sessionHash);
      if (!host.ok) return host;
      const at = now().getTime();
      const displays = await store.listRoomDisplays(roomId);
      return ok(
        displays.map((d, i) => ({
          id: d.id,
          label: `TV ${i + 1}`,
          status:
            d.lastSeenAt === null
              ? "connecting"
              : at - new Date(d.lastSeenAt).getTime() < DISPLAY_ONLINE_MS
                ? "showing"
                : "away",
        })),
      );
    },

    /** The host disconnects a TV; it goes back to showing a pairing code. */
    async revoke(
      roomId: string,
      sessionHash: string,
      displayId: string,
    ): Promise<Result<null, MembershipError | "not_host" | "display_not_found">> {
      const host = await asHost(roomId, sessionHash);
      if (!host.ok) return host;
      return (await store.revokeDisplay(roomId, displayId)) ? ok(null) : fail("display_not_found");
    },

    /** What this TV should show, from its cookie. Also records that it's still there. */
    async spectate(tokenHash: string | null): Promise<SpectatorState> {
      const display = tokenHash ? await store.getDisplayByToken(tokenHash) : null;
      if (!display) return { status: "unpaired", reason: "new" };
      const at = now();
      if (display.status === "revoked") return { status: "unpaired", reason: "revoked" };
      if (display.status !== "approved" || !display.roomId) {
        return display.status === "pending" && new Date(display.expiresAt) > at
          ? { status: "pending", expiresAt: display.expiresAt }
          : { status: "unpaired", reason: "expired" };
      }

      const [room, players] = await Promise.all([store.getRoomById(display.roomId), store.listPlayers(display.roomId)]);
      if (!room || !LIVE.has(effectiveStatus(room, at))) return { status: "ended" };
      if (!display.lastSeenAt || at.getTime() - new Date(display.lastSeenAt).getTime() >= DISPLAY_TOUCH_MS) {
        await store.touchDisplay(display.id, at.toISOString());
      }
      return { status: "paired", view: await viewOf(room, players) };
    },
  };
}

export type PartyService = ReturnType<typeof createPartyService>;
