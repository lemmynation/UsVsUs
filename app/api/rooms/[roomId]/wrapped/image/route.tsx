import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ChaosShareCard } from "@/components/chaos/chaos-share-card";
import { SHARE_CARD_SIZE, ShareCard } from "@/components/wrapped/share-card";
import { apiError, isRateLimited } from "@/lib/api";
import { getChaosService, getGameService, getRoomStore } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

// The report is frozen, so the card never changes; it's still only for this member.
const HEADERS = { "Cache-Control": "private, max-age=3600" };

/** Members only: the finished game's (or Mutation Machine match's) 1080×1920 Wrapped card as a PNG. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/wrapped/image">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  if (!sessionHash) return apiError("not_in_room");

  const room = await getRoomStore().getRoomById(roomId);
  if (room?.experience === "chain_reactions") {
    const chaos = await getChaosService().getWrapped(roomId, sessionHash);
    if (!chaos.ok) return apiError(chaos.error);
    return new ImageResponse(<ChaosShareCard report={chaos.value} mode={room.mode} site={request.nextUrl.host} />, {
      ...SHARE_CARD_SIZE,
      headers: HEADERS,
    });
  }

  const result = await getGameService().getWrapped(roomId, sessionHash);
  if (!result.ok) return apiError(result.error);

  return new ImageResponse(<ShareCard report={result.value} site={request.nextUrl.host} />, {
    ...SHARE_CARD_SIZE,
    headers: HEADERS,
  });
}
