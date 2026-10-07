import type { Player, Room } from "@/types/room";
import type { Result } from "./rules";
import type { RoomStore } from "./store";

export type MembershipError = "room_not_found" | "not_in_room" | "kicked";

/** Loads the room and the caller's player record, or explains why they can't act in it. */
export async function loadMembership(
  store: RoomStore,
  roomId: string,
  sessionHash: string | null,
): Promise<Result<{ room: Room; players: Player[]; me: Player }, MembershipError>> {
  const room = await store.getRoomById(roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const players = await store.listPlayers(roomId);
  const me = sessionHash ? players.find((p) => p.sessionTokenHash === sessionHash) : undefined;
  if (!me) return { ok: false, error: "not_in_room" };
  if (me.status === "kicked") return { ok: false, error: "kicked" };
  return { ok: true, value: { room, players, me } };
}
