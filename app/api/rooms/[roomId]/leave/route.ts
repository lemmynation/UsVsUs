import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isRateLimited } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getRoomService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/leave">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");

  if (!sessionHash) return apiError("not_in_room");
  const result = await getRoomService().leaveRoom(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);

  await notifyRoomChanged(roomId);
  return NextResponse.json({ ok: true });
}
