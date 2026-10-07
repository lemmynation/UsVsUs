import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { notifyRoomChanged } from "@/lib/realtime/server";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({
  questionId: z.string().max(64),
  optionId: z.string().max(8),
});

/** Lock in the caller's answer to the open question. Safe to retry: a second answer is ignored. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/answer">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");

  if (!sessionHash) return apiError("not_in_room");
  const result = await getGameService().submitAnswer(roomId, sessionHash, body);
  if (!result.ok) return apiError(result.error);

  if (!result.value.duplicate) {
    // Everyone else only learns *that* this player answered — never what.
    await Promise.all([notifyRoomChanged(roomId), track("question_answered", { sessionHash, roomId })]);
  }
  return NextResponse.json({ ok: true });
}
