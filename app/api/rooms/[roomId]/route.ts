import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isRateLimited } from "@/lib/api";
import { getRoomService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

/** Current room state for a member. Clients call this on load, on realtime pings, and on a slow poll. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomState", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");

  const result = await getRoomService().getRoomView(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json(result.value, { headers: { "Cache-Control": "no-store" } });
}
