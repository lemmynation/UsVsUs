import type { RoomStore } from "@/lib/rooms/store";

/**
 * Packs follow your phone: unlock the host's own packs in a room. A bonus, so it
 * must never block what triggered it (creating a room, a host handover, starting
 * a game): a failure is logged and the game carries on without the pack.
 */
export async function claimOwnedPacksSafely(store: RoomStore, roomId: string, sessionTokenHash: string, now: string) {
  try {
    return await store.claimOwnedPacks(roomId, sessionTokenHash, now);
  } catch (error) {
    console.error("[premium] couldn't unlock owned packs", error);
    return 0;
  }
}
