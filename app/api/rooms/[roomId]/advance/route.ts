import { NextResponse, type NextRequest } from "next/server";
import { timed } from "@/lib/timing";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({ stateVersion: z.number().int().positive() });

/** Host-only: next step of the game. Sending the version you saw makes double taps harmless. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/advance">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  if (!sessionHash) return apiError("not_in_room");
  const game = getGameService();
  const result = await game.advance(roomId, sessionHash, body.stateVersion);
  if (!result.ok) return apiError(result.error);

  await Promise.all([
    notifyRoomChanged(roomId),
    result.value.finished ? track("game_completed", { sessionHash, roomId }) : Promise.resolve(),
  ]);
  return NextResponse.json({ ok: true, stateVersion: result.value.stateVersion });
}

export const POST = timed("advance", handlePOST);
