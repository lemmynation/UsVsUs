import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getRoomService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({ playerId: z.uuid() });

/** Host-only: remove a player. They can't rejoin this room from the same browser. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/kick">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  if (!sessionHash) return apiError("not_in_room");
  const result = await getRoomService().kickPlayer(roomId, sessionHash, body.playerId);
  if (!result.ok) return apiError(result.error);

  await notifyRoomChanged(roomId);
  return NextResponse.json({ ok: true });
}
