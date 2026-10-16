import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { PageShell } from "@/components/layout/page-shell";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { GameCard } from "@/components/home/game-card";
import { HeroDemo } from "@/components/home/hero-demo";
import { VersusBackdrop } from "@/components/home/versus-backdrop";
import { JoinCodeForm } from "@/components/room/join-code-form";
import { chainReactionsEnabled } from "@/lib/env";
import { GAMES, OCCASIONS } from "@/lib/games";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <PageShell className="gap-10">
      <TrackOnMount event="landing_view" />
      <VersusBackdrop />

      <section className="flex flex-col items-center gap-5 pt-4 text-center">
        <h1>
          <Wordmark size="lg" />
        </h1>
        <p className="font-heading text-3xl leading-tight font-extrabold text-balance">
          How well do you <span className="text-(--us-yellow)">really</span> know your people?
        </p>
        <HeroDemo />
        <p className="text-muted-foreground max-w-xs text-base">
          Share a link, play on your phones. No app, no sign-up.
        </p>
        <Link
          href="#games"
          className={cn(buttonVariants({ size: "lg" }), "press-3d w-full text-xl")}
        >
          Start a game 🎲
        </Link>
      </section>

      <section aria-labelledby="join-heading" className="flex flex-col gap-3">
        <h2 id="join-heading" className="font-heading text-xl font-extrabold">
          Got a code from a friend?
        </h2>
        <JoinCodeForm compact />
      </section>

      <section aria-labelledby="occasions-heading" className="flex flex-col gap-3">
        <h2 id="occasions-heading" className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          Perfect for
        </h2>
        <ul className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <li
              key={o.label}
              className="rounded-full border-2 border-white/15 bg-white/5 px-3.5 py-1.5 text-base font-semibold"
            >
              <span aria-hidden>{o.emoji}</span> {o.label}
            </li>
          ))}
        </ul>
      </section>

      <section id="games" aria-labelledby="games-heading" className="flex scroll-mt-6 flex-col gap-6">
        <h2 id="games-heading" className="font-heading text-3xl font-extrabold">
          Pick your <span className="text-(--us-pink)">game</span>
        </h2>
        <GameCard game={GAMES.quiz} tilt="left" />
        {/* Mutation Machine only exists where its feature flag is on. */}
        {chainReactionsEnabled() && <GameCard game={GAMES.chaos} tilt="right" />}
      </section>

      <footer className="text-muted-foreground mt-auto text-center text-sm">
        <Link href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Privacy
        </Link>
      </footer>
    </PageShell>
  );
}
