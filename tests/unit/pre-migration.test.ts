import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { createChaosService } from "@/lib/chaos/service";
import { createGameService } from "@/lib/game/service";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { createRoomService } from "@/lib/rooms/service";
import type { RoomStore } from "@/lib/rooms/store";

/**
 * Production may run this code before migration 10 exists (Chain Reactions off).
 * A Quick Party room must then never touch the chaos tables: this store fails
 * loudly if anything does, like Postgres would ("relation does not exist").
 */
const CHAOS_METHODS = new Set<keyof RoomStore>([
  "startChainMatch",
  "getLatestChainMatch",
  "submitContribution",
  "listContributions",
  "advanceChainMatch",
  "recordChainScores",
  "listChainScores",
  "saveChaosWrapped",
]);

function preMigrationStore(): RoomStore {
  const inner = new MemoryRoomStore(structuredClone(BUNDLED_QUESTIONS));
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (CHAOS_METHODS.has(prop as keyof RoomStore)) {
        return () => Promise.reject(new Error(`chaos table touched: ${String(prop)}`));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("before migration 10 (Chain Reactions off)", () => {
  it("a whole Quick Party room lifecycle never touches the chaos tables", async () => {
    const store = preMigrationStore();
    let clock = new Date("2026-10-12T12:00:00Z");
    const now = () => clock;
    let seed = 5;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const game = createGameService({ store, now, random });
    const chaos = createChaosService({ store, content: CHAOS_CONTENT, now, random });
    let seq = 0;
    const rooms = createRoomService({ store, now, randomInt: (max) => seq++ % max, game, chaos });

    const created = await rooms.createRoom({ mode: "circle", nickname: "Lem", sessionHash: "h" });
    if (!created.ok) throw new Error(created.error);
    const { room } = created.value;
    for (const [i, nickname] of ["Ana", "Ben", "Cy"].entries()) {
      const joined = await rooms.joinRoom({ code: room.joinCode, nickname, sessionHash: `g${i}` });
      expect(joined.ok).toBe(true);
    }
    const view = await rooms.getRoomView(room.id, "h");
    expect(view.ok && view.value.chaos).toBeNull();

    // Kick and leave in the lobby, then again mid-game.
    const players = await store.listPlayers(room.id);
    expect((await rooms.kickPlayer(room.id, "h", players.find((p) => p.nickname === "Cy")!.id)).ok).toBe(true);
    expect((await game.startGame(room.id, "h")).ok).toBe(true);
    clock = new Date(clock.getTime() + 600_000); // long past any timer
    expect((await rooms.getRoomView(room.id, "g0")).ok).toBe(true);
    expect((await rooms.leaveRoom(room.id, "g1")).ok).toBe(true);
    expect((await rooms.leaveRoom(room.id, "h")).ok).toBe(true); // host hands over
    expect((await rooms.getRoomView(room.id, "g0")).ok).toBe(true);
  });
});
