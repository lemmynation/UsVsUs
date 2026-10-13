import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited } from "@/lib/api";
import { partyScreenEnabled } from "@/lib/env";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getPartyService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";
import { timed } from "@/lib/timing";

/** Host-only: disconnect a TV. It goes back to its pairing screen on its next refresh. */
async function handleDELETE(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/displays/[displayId]">) {
  if (!partyScreenEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId, displayId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!z.uuid().safeParse(displayId).success) return apiError("display_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getPartyService().revoke(roomId, sessionHash, displayId);
  if (!result.ok) return apiError(result.error);
  // The TV listens on the room channel: tell it to look again (and find itself revoked).
  await Promise.all([
    notifyRoomChanged(roomId),
    track("party_screen_disconnected", { sessionHash, roomId, properties: { by: "host" } }),
  ]);
  return NextResponse.json({ ok: true });
}

export const DELETE = timed("displays_revoke", handleDELETE);
