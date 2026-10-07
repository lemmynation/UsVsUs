import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playerNames } from "./names";
import { Badges, Standings } from "./standings";
import type { GameScreenProps } from "./types";

/** End of game: final Game Score or badges. The full Wrapped report and share card arrive in Phase 4. */
export function GameFinished({ view }: { view: GameScreenProps["view"] }) {
  const { game, room } = view;
  const names = playerNames(view);
  const [first, second] = game.standings;

  // The game ends early when everyone else leaves (a game needs at least two people).
  const endedEarly = view.players.length < 2;
  let headline = "That's a wrap!";
  if (endedEarly) {
    headline = "Game over";
  } else if (room.mode !== "circle" && first) {
    headline =
      second && first.points === second.points
        ? "It's a tie! 🤝"
        : `${names.labelOf(first.playerId)} ${first.playerId === view.me.playerId ? "win" : "wins"}! 🏆`;
  }

  return (
    <>
      <section className="animate-in fade-in zoom-in-95 flex flex-col items-center gap-3 text-center duration-500">
        <span aria-hidden className="text-6xl">
          🎬
        </span>
        <h1 className="font-heading text-mode-gradient text-5xl font-extrabold">{headline}</h1>
        <p className="text-muted-foreground text-lg">
          {endedEarly
            ? "Everyone else left, so the game ended early. Your points are below."
            : room.mode === "circle"
              ? "Here's who earned what tonight."
              : "Final Game Score — just for fun."}
        </p>
      </section>
      {room.mode === "circle" ? <Badges view={view} /> : <Standings view={view} showRound={false} />}
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-auto w-full")}>
        Play again
      </Link>
    </>
  );
}
