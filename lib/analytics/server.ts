import "server-only";
import { getRoomStore } from "@/lib/rooms/server";
import { analyticsIdFromHash } from "@/lib/session-token";
import type { ClientEventName, ServerEventName } from "./events";

/** Fire-and-forget: analytics must never break a game action. */
export async function track(
  eventName: ServerEventName | ClientEventName,
  opts: { sessionHash?: string | null; roomId?: string | null; properties?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await getRoomStore().recordEvent({
      anonymousSessionId: opts.sessionHash ? analyticsIdFromHash(opts.sessionHash) : null,
      roomId: opts.roomId ?? null,
      eventName,
      properties: opts.properties ?? {},
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[analytics] failed to record", eventName, error);
  }
}
