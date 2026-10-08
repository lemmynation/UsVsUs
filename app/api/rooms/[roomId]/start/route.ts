import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({ packSlug: z.string().max(40).nullish() });

/**
 * Host-only: pick fresh questions, create the game and move the room from LOBBY
 * to IN_GAME. With a pack, the room's entitlement is checked in the same step.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/start">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");

  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  if (!sessionHash) return apiError("not_in_room");
  const packSlug = body.packSlug ?? undefined;
  const result = await getGameService().startGame(roomId, sessionHash, { packSlug });
  if (!result.ok) return apiError(result.error);

  await Promise.all([
    notifyRoomChanged(roomId),
    track("game_started", { sessionHash, roomId, properties: packSlug ? { pack: packSlug } : {} }),
  ]);
  return NextResponse.json({ ok: true });
}
