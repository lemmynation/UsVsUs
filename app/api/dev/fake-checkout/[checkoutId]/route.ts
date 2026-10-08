import { NextResponse, type NextRequest } from "next/server";
import { getFakeProvider } from "@/lib/premium/server";

/**
 * Dev/test only: the fake checkout page's buttons post here. 404 unless
 * PAYMENT_PROVIDER=fake (which is refused in production).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/dev/fake-checkout/[checkoutId]">) {
  const fake = getFakeProvider();
  const { checkoutId } = await ctx.params;
  const checkout = fake?.get(checkoutId);
  if (!fake || !checkout) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const action = (await request.formData()).get("action");
  if (action === "pay") fake.pay(checkoutId);
  const back = action === "pay" ? checkout.successUrl : checkout.cancelUrl;
  return NextResponse.redirect(new URL(back, request.nextUrl.origin), 303);
}
