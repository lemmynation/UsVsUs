import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/premium/catalog";
import { getFakeProvider } from "@/lib/premium/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Test checkout — Us vs. Us" };

/** Dev/test stand-in for the payment provider's hosted checkout page. */
export default function FakeCheckoutPage(props: PageProps<"/dev/fake-checkout/[checkoutId]">) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingCard />}>
        <FakeCheckout params={props.params} />
      </Suspense>
    </PageShell>
  );
}

async function FakeCheckout({ params }: { params: PageProps<"/dev/fake-checkout/[checkoutId]">["params"] }) {
  await connection();
  const { checkoutId } = await params;
  const checkout = getFakeProvider()?.get(checkoutId);
  if (!checkout) notFound();

  return (
    <section className="flex flex-1 flex-col justify-center gap-6">
      <p className="rounded-xl border border-dashed border-amber-400 p-3 text-center text-base text-amber-300">
        Test checkout — no real money moves.
      </p>
      <div className="bg-card flex flex-col gap-1 rounded-3xl p-5">
        <span className="text-muted-foreground text-base">You&apos;re paying for</span>
        <span className="text-2xl font-bold">{checkout.packName}</span>
        <span className="font-heading text-4xl font-extrabold">{formatPrice(checkout.amountMinor)}</span>
      </div>
      <form action={`/api/dev/fake-checkout/${checkout.id}`} method="post" className="flex flex-col gap-3">
        <button name="action" value="pay" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Pay {formatPrice(checkout.amountMinor)} (test)
        </button>
        <button name="action" value="cancel" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "w-full")}>
          Cancel
        </button>
      </form>
    </section>
  );
}
