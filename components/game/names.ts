import type { RoomView } from "@/types/room";

/** Name lookups for a view: "You" for the viewer, nickname for everyone else. */
export function playerNames(view: RoomView) {
  const nicknameOf = (id: string) => view.players.find((p) => p.id === id)?.nickname ?? "Someone who left";
  return {
    nicknameOf,
    labelOf: (id: string) => (id === view.me.playerId ? "You" : nicknameOf(id)),
    partnerOf: (id: string) => view.players.find((p) => p.id !== id) ?? null,
  };
}
