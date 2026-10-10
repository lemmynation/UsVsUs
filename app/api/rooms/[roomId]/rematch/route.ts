import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHashAndRenew } from "@/lib/session";
import { timed } from "@/lib/timing";

/** Host-only: from Wrapped, send everyone back to this room's lobby for another game. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/rematch">) {
  const sessionHash = await readSessionHashAndRenew();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getGameService().rematch(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);
  if (result.value.reopened) {
    await Promise.all([notifyRoomChanged(roomId), track("rematch_started", { sessionHash, roomId })]);
  }
  return NextResponse.json({ ok: true });
}

export const POST = timed("rematch", handlePOST);
