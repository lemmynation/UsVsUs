import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { createHref, type GameMeta } from "@/lib/games";
import { cn } from "@/lib/utils";

/** The steps of a game, folded away until someone wants them (no JS needed). */
export function HowToPlay({ game, open = false }: { game: GameMeta; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl bg-white/5 px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
        How to play
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pb-4 pl-5 text-base">
        {game.howToPlay.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

/** A game on the home page: what it is, how long, one example, and how to play. */
export function GameCard({ game }: { game: GameMeta }) {
  const headingId = `game-${game.key}`;
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        game.className,
        "bg-card flex flex-col gap-4 rounded-3xl border border-white/10 p-5 shadow-lg shadow-black/20",
      )}
    >
      <header className="flex items-start gap-4">
        <span aria-hidden className="bg-mode-gradient grid size-14 shrink-0 place-items-center rounded-2xl text-3xl">
          {game.emoji}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="font-heading text-2xl font-extrabold">
            {game.name}
          </h3>
          <p className="text-muted-foreground text-sm">
            {game.players} · ⏱ {game.duration}
          </p>
        </div>
      </header>
      <p className="text-lg">{game.pitch}</p>
      <figure className="border-mode-gradient rounded-2xl p-4">
        <figcaption className="text-muted-foreground mb-1 text-sm font-semibold tracking-wide uppercase">
          {game.example.label}
        </figcaption>
        {game.example.lines.map((line) => (
          <p key={line} className="text-base">
            {line}
          </p>
        ))}
      </figure>
      <HowToPlay game={game} />
      <Link href={createHref(game.key)} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        Play {game.name}
      </Link>
    </article>
  );
}
