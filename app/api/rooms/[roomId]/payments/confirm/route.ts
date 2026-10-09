import { NextResponse, type NextRequest } from "next/server";
import { timed } from "@/lib/timing";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited } from "@/lib/api";
import { getPremiumService } from "@/lib/premium/server";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { readSessionHash } from "@/lib/session";

/**
 * Re-checks the room's pending payments with the provider — used when the host
 * returns from checkout, so a pack unlocks even if the provider's webhook is lost.
 */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/payments/confirm">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getPremiumService().confirmForRoom(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);

  const { granted, mismatched } = result.value;
  await Promise.all([
    granted.length > 0 ? notifyRoomChanged(roomId) : Promise.resolve(),
    ...granted.map((pack) => track("purchase_succeeded", { sessionHash, roomId, properties: { pack } })),
    mismatched > 0
      ? track("purchase_failed", { sessionHash, roomId, properties: { reason: "verification_mismatch" } })
      : Promise.resolve(),
  ]);
  return NextResponse.json(
    { unlocked: result.value.unlocked, pending: result.value.pending },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = timed("payment_confirm", handlePOST);
