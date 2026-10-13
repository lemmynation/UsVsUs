import { NextResponse, type NextRequest } from "next/server";
import { apiError, isRateLimited } from "@/lib/api";
import { partyScreenEnabled } from "@/lib/env";
import { readDisplayHash } from "@/lib/party/cookie";
import { getPartyService } from "@/lib/rooms/server";
import { timed } from "@/lib/timing";

/** What this TV should show: a pairing code, or its room's spectator view. Polled. */
async function handleGET(request: NextRequest) {
  if (!partyScreenEnabled()) return apiError("feature_off");
  const displayHash = await readDisplayHash();
  if (isRateLimited(request, "roomState", displayHash)) return apiError("rate_limited");

  const state = await getPartyService().spectate(displayHash);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

export const GET = timed("party_state", handleGET, 0.05);
