import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { HowToPlay } from "@/components/home/game-card";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { CreateRoomForm } from "@/components/room/create-room-form";
import { ModePicker } from "@/components/room/mode-card";
import { chainReactionsEnabled } from "@/lib/env";
import { createHref, GAMES, type GameKey } from "@/lib/games";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Start a game — Us vs. Us" };

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

const backLink =
  "text-muted-foreground inline-flex min-h-11 w-fit items-center text-base underline-offset-4 hover:underline";

async function CreateContent({ searchParams }: { searchParams: PageProps<"/create">["searchParams"] }) {
  const { mode: rawMode, game: rawGame } = await searchParams;
  // Mutation Machine only exists where its feature flag is on; anything else is Mind Match.
  const key: GameKey = rawGame === "chaos" && chainReactionsEnabled() ? "chaos" : "quiz";
  const game = GAMES[key];
  const audience = game.audiences.find((a) => a.mode === rawMode);

  if (!audience) {
    return (
      <div className={cn(game.className, "flex flex-col gap-6")}>
        <Link href="/" className={backLink}>
          ← All games
        </Link>
        <div className="flex flex-col gap-2">
          <span className="bg-mode-gradient w-fit rounded-full px-3 py-1 text-sm font-semibold text-[oklch(0.18_0.04_300)]">
            {game.emoji} {game.name} · ⏱ {game.duration}
          </span>
          <h1 className="font-heading text-4xl font-extrabold">Who&apos;s playing?</h1>
          <p className="text-muted-foreground text-lg">{game.pitch}</p>
        </div>
        <ModePicker game={key} />
        <HowToPlay game={game} />
      </div>
    );
  }

  return (
    <div className={cn(MODE_META[audience.mode].className, "flex flex-col gap-6")}>
      <Link href={createHref(key)} className={backLink}>
        ← Change who&apos;s playing
      </Link>
      <div className="flex flex-col gap-2">
        <span className="bg-mode-gradient w-fit rounded-full px-3 py-1 text-sm font-semibold text-[oklch(0.18_0.04_300)]">
          {game.emoji} {game.name} · {audience.label} · {audience.players}
        </span>
        <h1 className="font-heading text-4xl font-extrabold">Create your room</h1>
        <p className="text-muted-foreground text-lg">
          You&apos;ll get a link to share once it&apos;s ready. About {game.duration}.
        </p>
      </div>
      <CreateRoomForm mode={audience.mode} experience={game.experience} label={audience.label} />
      <HowToPlay game={game} />
    </div>
  );
}
