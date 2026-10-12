import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { chainReactionsEnabled } from "@/lib/env";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getChaosService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";
import { timed } from "@/lib/timing";

const bodySchema = z.object({
  stateVersion: z.number().int().positive(),
  action: z.enum(["skip_waiting", "reveal_next", "finish"]),
});

/** Host-only: skip waiting (after the timer), next chain in the reveal, or straight to the recap. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/chaos/advance">) {
  if (!chainReactionsEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getChaosService().advance(roomId, sessionHash, body);
  if (!result.ok) return apiError(result.error);
  await Promise.all([
    notifyRoomChanged(roomId),
    body.action === "skip_waiting" ? track("chaos_step_skipped", { sessionHash, roomId }) : Promise.resolve(),
    result.value.phase === "RECAP" ? track("chaos_match_completed", { sessionHash, roomId }) : Promise.resolve(),
  ]);
  return NextResponse.json({ ok: true });
}

export const POST = timed("chaos_advance", handlePOST);
