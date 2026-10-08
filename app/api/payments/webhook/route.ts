import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/server";
import { getPremiumService } from "@/lib/premium/server";
import { notifyRoomChanged } from "@/lib/realtime/server";

/**
 * Payment provider webhook (PayMongo: checkout_session.payment.paid). The raw body
 * is read before any parsing so the signature can be checked. A valid event only
 * makes the server re-check the checkout with the provider; nothing in the event
 * itself is trusted to unlock a pack.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let result: Awaited<ReturnType<ReturnType<typeof getPremiumService>["handleWebhook"]>>;
  try {
    result = await getPremiumService().handleWebhook(rawBody, request.headers);
  } catch (error) {
    // Couldn't reach the provider to verify: a 5xx makes it retry later.
    console.error("[premium] webhook processing failed", error);
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  const { outcome, payment } = result;
  if (outcome === "invalid") return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  if (payment && (outcome === "granted" || outcome === "mismatch")) {
    await Promise.all([
      outcome === "granted" ? notifyRoomChanged(payment.roomId) : Promise.resolve(),
      track(outcome === "granted" ? "purchase_succeeded" : "purchase_failed", {
        roomId: payment.roomId,
        properties: { pack: payment.packSlug, via: "webhook" },
      }),
    ]);
  }
  // Valid events are always acknowledged (2xx + JSON), as the provider requires.
  return NextResponse.json({ received: true, outcome });
}
