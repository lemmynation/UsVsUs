import "server-only";
import { randomInt } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { createGameService, type GameService } from "@/lib/game/service";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { MemoryRoomStore } from "./memory-store";
import { createRoomService, type RoomService } from "./service";
import { SupabaseRoomStore } from "./supabase-store";
import type { RoomStore } from "./store";

// Survives dev hot reloads so in-memory rooms aren't wiped on every edit.
const globalForStore = globalThis as unknown as { __usVsUsMemoryStore?: MemoryRoomStore };

export function getRoomStore(): RoomStore {
  if (getServerEnv().store === "supabase") {
    return new SupabaseRoomStore(getSupabaseAdmin());
  }
  globalForStore.__usVsUsMemoryStore ??= new MemoryRoomStore();
  return globalForStore.__usVsUsMemoryStore;
}

export function getGameService(): GameService {
  return createGameService({
    store: getRoomStore(),
    now: () => new Date(),
    random: Math.random,
    onRoomChanged: notifyRoomChanged,
  });
}

export function getRoomService(): RoomService {
  return createRoomService({ store: getRoomStore(), now: () => new Date(), randomInt, game: getGameService() });
}
