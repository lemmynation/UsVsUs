"use client";

import Link from "next/link";
import { trackClient } from "@/lib/client-api";
import { createHref, GAMES, type Audience, type GameKey } from "@/lib/games";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";

/** "Who's playing?": one audience (Couple, Friends, Circle, Duo Chaos…) for a game. */
export function ModeCard({ game, audience }: { game: GameKey; audience: Audience }) {
  return (
    <Link
      href={createHref(game, audience.mode)}
      onClick={() => trackClient("mode_selected", { mode: audience.mode })}
      className={cn(
        MODE_META[audience.mode].className,
        "border-mode-gradient group focus-visible:ring-ring/60 flex items-center gap-4 rounded-3xl p-5 shadow-lg shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:outline-none active:scale-[0.98]",
      )}
    >
      <span aria-hidden className="bg-mode-gradient grid size-14 shrink-0 place-items-center rounded-2xl text-3xl">
        {audience.emoji}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-heading text-2xl font-extrabold">{audience.label}</span>
          <span className="text-muted-foreground text-sm">{audience.players}</span>
        </span>
        <span className="text-muted-foreground text-base">{audience.tagline}</span>
      </span>
    </Link>
  );
}

export function ModePicker({ game = "quiz" }: { game?: GameKey }) {
  return (
    <ul className="flex flex-col gap-4" aria-label="Who's playing">
      {GAMES[game].audiences.map((audience) => (
        <li key={audience.mode}>
          <ModeCard game={game} audience={audience} />
        </li>
      ))}
    </ul>
  );
}
