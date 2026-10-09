import { NextResponse } from "next/server";
import { timed } from "@/lib/timing";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimitedShared, parseBody } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getRoomService } from "@/lib/rooms/server";
import { getOrCreateSessionHash } from "@/lib/session";

const bodySchema = z.object({
  code: z.string().max(20),
  nickname: z.string().max(200),
});

async function handlePOST(request: Request) {
  if (await isRateLimitedShared(request, "joinRoom")) return apiError("rate_limited");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  const sessionHash = await getOrCreateSessionHash();
  const result = await getRoomService().joinRoom({ ...body, sessionHash });
  if (!result.ok) {
    await track("join_failed", { sessionHash, properties: { reason: result.error } });
    return apiError(result.error);
  }

  const { roomId, alreadyMember } = result.value;
  if (!alreadyMember) {
    await Promise.all([notifyRoomChanged(roomId), track("player_joined", { sessionHash, roomId })]);
  }
  return NextResponse.json({ roomId });
}

export const POST = timed("join_room", handlePOST);
