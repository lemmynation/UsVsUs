import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { CreateRoomForm } from "@/components/room/create-room-form";
import { ModePicker } from "@/components/room/mode-card";
import { chainReactionsEnabled } from "@/lib/env";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { MODES, type Mode } from "@/types/room";

export const metadata = { title: "Start a game — Us vs. Us" };

const chaosLabel = (mode: Mode) => (mode === "circle" ? "Circle Chaos" : "Duo Chaos");

export default function CreatePage(props: PageProps<"/create">) {
  return (
    <PageShell>
      <Wordmark />
      <Suspense fallback={<LoadingCard />}>
        <CreateContent searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function CreateContent({ searchParams }: { searchParams: PageProps<"/create">["searchParams"] }) {
  const { mode: rawMode, game } = await searchParams;
  const mode = MODES.find((m) => m === rawMode) as Mode | undefined;
  // Chain Reactions only exists where its feature flag is on.
  const chaos = game === "chaos" && chainReactionsEnabled();

  if (!mode) {
    return (
      <>
        <h1 className="font-heading text-4xl font-extrabold">Who are you playing with?</h1>
        <ModePicker />
      </>
    );
  }

  const meta = MODE_META[mode];
  return (
    <div className={cn(meta.className, "flex flex-col gap-6")}>
      <div className="flex flex-col gap-2">
        <span className="bg-mode-gradient w-fit rounded-full px-3 py-1 text-sm font-semibold text-[oklch(0.18_0.04_300)]">
          {chaos
            ? `⚡ ${chaosLabel(mode)} · ${mode === "circle" ? "3–10 players" : "2 players"}`
            : `${meta.emoji} ${meta.label} · ${meta.players}`}
        </span>
        <h1 className="font-heading text-4xl font-extrabold">Create your room</h1>
        <p className="text-muted-foreground text-lg">
          {chaos
            ? "Mutation Machine: draw a thing, someone secretly mutates it, everyone works out what happened."
            : "You&apos;ll get a link to share once it&apos;s ready."}
        </p>
      </div>
      <CreateRoomForm mode={mode} experience={chaos ? "chain_reactions" : "quick_party"} />
    </div>
  );
}
