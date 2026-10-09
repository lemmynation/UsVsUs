import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { FEEDBACK_COMMENT_MAX } from "@/lib/rooms/rules";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  // Room for multi-byte emoji; the server trims to FEEDBACK_COMMENT_MAX characters.
  comment: z
    .string()
    .max(FEEDBACK_COMMENT_MAX * 4)
    .nullish(),
});

/** A member rates the game they just finished (optionally with a comment). Sending again replaces it. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/feedback">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getGameService().submitFeedback(roomId, sessionHash, body);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json({ ok: true });
}
