export const ROOM_CHANGED_EVENT = "room_changed";

/**
 * Live reaction (engagement phase). The one broadcast that carries anything: an
 * emoji from REACTIONS and the sender's random nonce (so the sender can skip its
 * own echo). Never who sent it, and never room data or answers.
 */
export const REACTION_EVENT = "reaction";

/** The only emoji players can send (all Unicode ≤ 12, so every phone can show them). */
export const REACTIONS = ["😂", "🔥", "😳", "💀", "😍", "👏"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const isReaction = (value: unknown): value is Reaction =>
  typeof value === "string" && (REACTIONS as readonly string[]).includes(value);

/** Random per-send id: 8–32 URL-safe characters. */
export const isReactionNonce = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,32}$/.test(value);

export function roomChannelName(roomId: string): string {
  return `room:${roomId}`;
}
