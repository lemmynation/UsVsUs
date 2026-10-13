import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, isRateLimitedShared, parseBody } from "@/lib/api";
import { partyScreenEnabled } from "@/lib/env";
import { getPartyService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";
import { timed } from "@/lib/timing";

const bodySchema = z.object({ code: z.string().max(20) });

/** Host-only: the room's connected TVs. */
async function handleGET(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/displays">) {
  if (!partyScreenEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getPartyService().list(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json({ displays: result.value }, { headers: { "Cache-Control": "no-store" } });
}

/** Host-only: approve the code a TV is showing. Single use; limited per phone and per room. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/displays">) {
  if (!partyScreenEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHash();
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (
    (await isRateLimitedShared(request, "pairDisplay", sessionHash)) ||
    (await isRateLimitedShared(request, "pairDisplayRoom", null, { by: `room:${roomId}` }))
  ) {
    return apiError("rate_limited");
  }
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getPartyService().pair(roomId, sessionHash, body.code);
  if (!result.ok) return apiError(result.error);
  await track("party_screen_pair_approved", { sessionHash, roomId });
  return NextResponse.json({ ok: true, displayId: result.value.displayId });
}

export const GET = timed("displays_list", handleGET);
export const POST = timed("displays_pair", handlePOST);
