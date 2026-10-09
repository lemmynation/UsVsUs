import { NextResponse } from "next/server";
import { timed } from "@/lib/timing";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimitedShared, parseBody } from "@/lib/api";
import { getRoomService } from "@/lib/rooms/server";
import { getOrCreateSessionHash } from "@/lib/session";
import { MODES } from "@/types/room";

const bodySchema = z.object({
  mode: z.enum(MODES),
  nickname: z.string().max(200),
  roomName: z.string().max(200).nullish(),
});

/** Create a room; the caller becomes its host. */
async function handlePOST(request: Request) {
  if (await isRateLimitedShared(request, "createRoom")) return apiError("rate_limited");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  const sessionHash = await getOrCreateSessionHash();
  const result = await getRoomService().createRoom({ ...body, sessionHash });
  if (!result.ok) return apiError(result.error);

  const { room } = result.value;
  await track("room_created", { sessionHash, roomId: room.id, properties: { mode: room.mode } });
  return NextResponse.json({ roomId: room.id, joinCode: room.joinCode }, { status: 201 });
}

export const POST = timed("create_room", handlePOST);
