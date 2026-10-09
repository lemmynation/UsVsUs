import { NextResponse, type NextRequest } from "next/server";
import { timed } from "@/lib/timing";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimited, parseBody } from "@/lib/api";
import { checkoutReturnOrigin, getPremiumService } from "@/lib/premium/server";
import { readSessionHash } from "@/lib/session";

const bodySchema = z.object({ packSlug: z.string().max(40) });

/** Host-only: opens the provider's checkout for a pack. The price comes from the server's catalog. */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/rooms/[roomId]/checkout">) {
  const sessionHash = await readSessionHash();
  if (isRateLimited(request, "roomAction", sessionHash)) return apiError("rate_limited");
  const { roomId } = await ctx.params;
  if (!z.uuid().safeParse(roomId).success) return apiError("room_not_found");
  const body = await parseBody(request, bodySchema);
  if (!body) return apiError("invalid_input");
  if (!sessionHash) return apiError("not_in_room");

  const result = await getPremiumService().startCheckout(roomId, sessionHash, {
    packSlug: body.packSlug,
    origin: checkoutReturnOrigin(request.nextUrl.origin),
  });
  if (!result.ok) return apiError(result.error);

  if (!result.value.reused) {
    await track("checkout_started", { sessionHash, roomId, properties: { pack: body.packSlug } });
  }
  return NextResponse.json({ checkoutUrl: result.value.checkoutUrl });
}

export const POST = timed("checkout", handlePOST);
