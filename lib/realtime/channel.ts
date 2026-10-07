export const ROOM_CHANGED_EVENT = "room_changed";

export function roomChannelName(roomId: string): string {
  return `room:${roomId}`;
}
