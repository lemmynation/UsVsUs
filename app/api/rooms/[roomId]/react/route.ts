import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { isReaction, isReactionNonce } from "@/lib/realtime/channel";
import { broadcastReaction } from "@/lib/realtime/server";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({
  emoji: z.string().refine(isReaction),
  nonce: z.string().refine(isReactionNonce),
});

/**
 * A live reaction during a reveal or on Wrapped. Only the emoji goes out to the
 * room (anonymous); nothing is stored but a count for the dashboard.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/react">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "reaction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body || !isReaction(body.emoji)) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const allowed = await getGameService().canReact(roomId, sessionHash);
  if (!allowed.ok) return apiError(allowed.error);
  await Promise.all([
    broadcastReaction(roomId, body.emoji, body.nonce),
    track("reaction_sent", { sessionHash, roomId, properties: { emoji: body.emoji } }),
  ]);
  return NextResponse.json({ ok: true });
}
