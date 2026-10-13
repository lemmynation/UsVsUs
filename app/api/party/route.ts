import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics/server";
import { apiError, isRateLimitedShared } from "@/lib/api";
import { partyScreenEnabled } from "@/lib/env";
import { setDisplayCookie } from "@/lib/party/cookie";
import { getPartyService } from "@/lib/rooms/server";
import { timed } from "@/lib/timing";

/**
 * A TV or laptop asks for a pairing code (docs/usvsus-4/07). It gets a fresh code
 * and cookie each time; the host types the code on their phone to approve it.
 */
async function handlePOST(request: NextRequest) {
  if (!partyScreenEnabled()) return apiError("feature_off");
  if (await isRateLimitedShared(request, "createDisplay")) return apiError("rate_limited");

  const result = await getPartyService().request();
  if (!result.ok) return apiError(result.error);
  await Promise.all([setDisplayCookie(result.value.token), track("party_screen_pair_requested")]);
  return NextResponse.json(
    { code: result.value.code, expiresAt: result.value.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = timed("party_request", handlePOST);
