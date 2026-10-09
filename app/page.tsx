import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { PageShell } from "@/components/layout/page-shell";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { ModePicker } from "@/components/room/mode-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <PageShell className="gap-8">
      <TrackOnMount event="landing_view" />
      <section className="flex flex-col items-center gap-3 pt-6 text-center">
        <Wordmark size="lg" />
        <p className="font-heading text-2xl font-bold">How well do you really know your people?</p>
        <p className="text-muted-foreground max-w-xs text-lg">
          Share a link, play from your phones, and find out who knows who best. No app, no sign-up.
        </p>
      </section>

      <section aria-labelledby="modes-heading" className="flex flex-col gap-4">
        <h2 id="modes-heading" className="text-lg font-semibold">
          Start a game
        </h2>
        <ModePicker />
      </section>

      <Link href="/join" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
        Join with code
      </Link>

      <footer className="text-muted-foreground mt-auto text-center text-sm">
        <Link href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Privacy
        </Link>
      </footer>
    </PageShell>
  );
}
