import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { chainReactionsEnabled } from "@/lib/env";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getChaosService, getRoomStore } from "@/lib/rooms/server";
import { readSessionHashAndRenew } from "@/lib/session";
import { timed } from "@/lib/timing";

const bodySchema = z.object({ vibe: z.enum(["surprise", "chill", "chaos", "deep"]).optional() });

/** Host-only: freeze a match plan and start Mutation Machine (LOBBY → IN_GAME). */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/chaos/start">) {
  if (!chainReactionsEnabled()) return apiError("feature_off");
  const sessionHash = await readSessionHashAndRenew();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getChaosService().start(roomId, sessionHash, body);
  if (!result.ok) return apiError(result.error);
  const match = await getRoomStore().getLatestChainMatch(roomId);
  await Promise.all([
    notifyRoomChanged(roomId),
    track("chaos_match_started", {
      sessionHash,
      roomId,
      properties: {
        game: match?.gameId ?? "mutation_machine",
        playerCount: match?.plan.playerOrder.length ?? 0,
        vibe: match?.plan.vibe ?? "surprise",
        contentVersion: match?.plan.contentVersion ?? 0,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, matchId: result.value.matchId });
}

export const POST = timed("chaos_start", handlePOST);
