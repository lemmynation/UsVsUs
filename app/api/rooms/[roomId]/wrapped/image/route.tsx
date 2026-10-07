import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { SHARE_CARD_SIZE, ShareCard } from "@/components/wrapped/share-card";
import { apiError, isRateLimited } from "@/lib/api";
import { getGameService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

/** Members only: the finished game's 1080×1920 Wrapped card as a PNG. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/wrapped/image">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getGameService().getWrapped(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);

  return new ImageResponse(<ShareCard report={result.value} site={request.nextUrl.host} />, {
    ...SHARE_CARD_SIZE,
    // The report is frozen, so the card never changes; it's still only for this member.
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
