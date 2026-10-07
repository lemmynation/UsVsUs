import { beforeEach, describe, expect, it } from "vitest";
import { createGameService, type GameService } from "@/lib/game/service";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { JOIN_CODE_ALPHABET, ROOM_TTL_MS } from "@/lib/rooms/rules";
import { createRoomService, type RoomService } from "@/lib/rooms/service";
import type { Mode } from "@/types/room";

let store: MemoryRoomStore;
let service: RoomService;
let game: GameService;
let clock: Date;
/** Characters the fake RNG hands out next; empty means "count upward". */
let queued: string[];

/** Make the next generated join codes exactly these. */
function queueCodes(...codes: string[]) {
  queued.push(...codes.join(""));
}

beforeEach(() => {
  store = new MemoryRoomStore();
  clock = new Date("2026-10-07T12:00:00Z");
  queued = [];
  let seq = 0;
  game = createGameService({ store, now: () => clock, random: () => 0.5 });
  service = createRoomService({
    store,
    now: () => clock,
    randomInt: (max) => {
      const ch = queued.shift();
      return ch ? JOIN_CODE_ALPHABET.indexOf(ch) : seq++ % max;
    },
    game,
  });
});

async function createRoom(mode: Mode = "couple", nickname = "Lem", sessionHash = "host") {
  const result = await service.createRoom({ mode, nickname, sessionHash });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function join(code: string, nickname: string, sessionHash: string) {
  return service.joinRoom({ code, nickname, sessionHash });
}

describe("createRoom", () => {
  it("creates a lobby with the caller as host", async () => {
    const { room, host } = await createRoom("couple", "  Lem  ");
    expect(room.status).toBe("LOBBY");
    expect(room.hostPlayerId).toBe(host.id);
    expect(host).toMatchObject({ nickname: "Lem", isHost: true, sessionTokenHash: "host" });
    expect(new Date(room.expiresAt).getTime() - clock.getTime()).toBe(ROOM_TTL_MS);
  });

  it("validates nickname and room name", async () => {
    expect(await service.createRoom({ mode: "couple", nickname: " ", sessionHash: "h" })).toEqual({
      ok: false,
      error: "nickname_required",
    });
    expect(
      await service.createRoom({ mode: "couple", nickname: "Lem", roomName: "x".repeat(41), sessionHash: "h" }),
    ).toEqual({ ok: false, error: "room_name_too_long" });
  });

  it("retries when a join code is already taken", async () => {
    queueCodes("AAAAAA", "AAAAAA", "BBBBBB");
    const first = await createRoom();
    const second = await createRoom("couple", "Ana", "other");
    expect(first.room.joinCode).toBe("AAAAAA");
    expect(second.room.joinCode).toBe("BBBBBB");
  });

  it("gives up after repeated collisions", async () => {
    queueCodes(...Array<string>(6).fill("AAAAAA"));
    await createRoom();
    expect(await service.createRoom({ mode: "couple", nickname: "Ana", sessionHash: "x" })).toEqual({
      ok: false,
      error: "code_generation_failed",
    });
  });
});

describe("joinRoom", () => {
  it("adds a guest by code, accepting lowercase input", async () => {
    const { room } = await createRoom();
    const result = await join(room.joinCode.toLowerCase(), "Ana", "guest");
    expect(result).toMatchObject({ ok: true, value: { roomId: room.id, alreadyMember: false } });
  });

  it("is idempotent for the same browser session", async () => {
    const { room, host } = await createRoom();
    const again = await join(room.joinCode, "Whatever", "host");
    expect(again).toMatchObject({ ok: true, value: { alreadyMember: true, player: { id: host.id } } });
    expect(await store.listPlayers(room.id)).toHaveLength(1);
  });

  it("enforces capacity", async () => {
    const { room } = await createRoom();
    await join(room.joinCode, "Ana", "g1");
    expect(await join(room.joinCode, "Ben", "g2")).toEqual({ ok: false, error: "room_full" });
  });

  it("rejects duplicate nicknames", async () => {
    const { room } = await createRoom("circle");
    expect(await join(room.joinCode, "lem", "g1")).toEqual({ ok: false, error: "nickname_taken" });
  });

  it("rejects unknown, malformed and expired codes", async () => {
    expect(await join("ZZZZZZ", "Ana", "g")).toEqual({ ok: false, error: "room_not_found" });
    expect(await join("nope", "Ana", "g")).toEqual({ ok: false, error: "invalid_code" });

    const { room } = await createRoom();
    clock = new Date(clock.getTime() + ROOM_TTL_MS);
    expect(await join(room.joinCode, "Ana", "g")).toEqual({ ok: false, error: "room_expired" });
  });

  it("rejects joining after the game started", async () => {
    const { room } = await createRoom();
    await join(room.joinCode, "Ana", "g1");
    await game.startGame(room.id, "host");
    expect(await join(room.joinCode, "Ben", "g2")).toEqual({ ok: false, error: "room_in_progress" });
  });
});

describe("getJoinInfo", () => {
  it("sends existing members straight to the room", async () => {
    const { room } = await createRoom();
    expect(await service.getJoinInfo(room.joinCode, "host")).toEqual({ kind: "member", roomId: room.id });
  });

  it("previews a joinable room for a visitor", async () => {
    const { room } = await createRoom("circle");
    expect(await service.getJoinInfo(room.joinCode, null)).toMatchObject({
      kind: "joinable",
      preview: { joinCode: room.joinCode, mode: "circle", playerCount: 1, maxPlayers: 10 },
    });
  });

  it("explains why a room can't be joined", async () => {
    const { room } = await createRoom();
    await join(room.joinCode, "Ana", "g1");
    expect(await service.getJoinInfo(room.joinCode, "visitor")).toMatchObject({
      kind: "unavailable",
      error: "room_full",
    });
    expect(await service.getJoinInfo("??", null)).toMatchObject({ kind: "unavailable", error: "invalid_code" });
  });
});

describe("getRoomView", () => {
  it("returns players in join order without session hashes", async () => {
    const { room } = await createRoom("circle");
    clock = new Date(clock.getTime() + 1000);
    await join(room.joinCode, "Ana", "g1");
    const view = await service.getRoomView(room.id, "g1");
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.players.map((p) => p.nickname)).toEqual(["Lem", "Ana"]);
    expect(view.value.me.isHost).toBe(false);
    expect(view.value.room).toMatchObject({ minPlayers: 3, maxPlayers: 10 });
    expect(JSON.stringify(view.value)).not.toContain("g1");
  });

  it("refuses non-members", async () => {
    const { room } = await createRoom();
    expect(await service.getRoomView(room.id, "stranger")).toEqual({ ok: false, error: "not_in_room" });
    expect(await service.getRoomView(room.id, null)).toEqual({ ok: false, error: "not_in_room" });
  });
});

describe("startGame", () => {
  it("requires the minimum number of players", async () => {
    const { room } = await createRoom();
    expect(await game.startGame(room.id, "host")).toEqual({ ok: false, error: "not_enough_players" });
    await join(room.joinCode, "Ana", "g1");
    expect(await game.startGame(room.id, "host")).toMatchObject({ ok: true });
    expect((await store.getRoomById(room.id))?.status).toBe("IN_GAME");
  });

  it("only the host can start", async () => {
    const { room } = await createRoom();
    await join(room.joinCode, "Ana", "g1");
    expect(await game.startGame(room.id, "g1")).toEqual({ ok: false, error: "not_host" });
  });

  it("re-checks the player count atomically in the store", async () => {
    // Simulates someone leaving between the service's check and the write.
    const { room } = await createRoom();
    expect(await store.startGame({ roomId: room.id, minPlayers: 2, rounds: [], now: clock.toISOString() })).toBe(
      "not_enough_players",
    );
    expect((await store.getRoomById(room.id))?.status).toBe("LOBBY");
  });

  it("cannot start twice", async () => {
    const { room } = await createRoom();
    await join(room.joinCode, "Ana", "g1");
    await game.startGame(room.id, "host");
    expect(await game.startGame(room.id, "host")).toEqual({ ok: false, error: "not_in_lobby" });
  });
});

describe("kickPlayer", () => {
  it("removes the player and blocks them from rejoining", async () => {
    const { room } = await createRoom("circle");
    const joined = await join(room.joinCode, "Ana", "g1");
    if (!joined.ok) throw new Error(joined.error);

    expect(await service.kickPlayer(room.id, "host", joined.value.player.id)).toEqual({ ok: true, value: null });
    expect(await service.getRoomView(room.id, "g1")).toEqual({ ok: false, error: "kicked" });
    expect(await join(room.joinCode, "Ana again", "g1")).toEqual({ ok: false, error: "kicked" });
  });

  it("frees the kicked player's seat", async () => {
    const { room } = await createRoom();
    const joined = await join(room.joinCode, "Ana", "g1");
    if (!joined.ok) throw new Error(joined.error);
    await service.kickPlayer(room.id, "host", joined.value.player.id);
    expect((await join(room.joinCode, "Ben", "g2")).ok).toBe(true);
  });

  it("only the host can kick", async () => {
    const { room, host } = await createRoom("circle");
    await join(room.joinCode, "Ana", "g1");
    expect(await service.kickPlayer(room.id, "g1", host.id)).toEqual({ ok: false, error: "not_host" });
  });
});

describe("leaveRoom", () => {
  it("hands host to the earliest remaining player", async () => {
    const { room } = await createRoom("circle");
    clock = new Date(clock.getTime() + 1000);
    await join(room.joinCode, "Ana", "g1");
    clock = new Date(clock.getTime() + 1000);
    await join(room.joinCode, "Ben", "g2");

    await service.leaveRoom(room.id, "host");
    const view = await service.getRoomView(room.id, "g1");
    if (!view.ok) throw new Error(view.error);
    expect(view.value.me.isHost).toBe(true);
    expect(view.value.players.map((p) => p.nickname)).toEqual(["Ana", "Ben"]);
  });

  it("abandons the room when the last player leaves", async () => {
    const { room } = await createRoom();
    await service.leaveRoom(room.id, "host");
    expect((await store.getRoomById(room.id))?.status).toBe("ABANDONED");
  });

  it("lets a player who left join again", async () => {
    const { room } = await createRoom("circle");
    await join(room.joinCode, "Ana", "g1");
    await service.leaveRoom(room.id, "g1");
    expect((await join(room.joinCode, "Ana", "g1")).ok).toBe(true);
  });
});
