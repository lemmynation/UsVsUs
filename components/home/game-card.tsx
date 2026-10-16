import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { createHref, type GameMeta } from "@/lib/games";
import { cn } from "@/lib/utils";

/** The steps of a game, folded away until someone wants them (no JS needed). `children` shows above the steps. */
export function HowToPlay({
  game,
  open = false,
  children,
}: {
  game: GameMeta;
  open?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <details open={open} className="group rounded-2xl bg-white/5 px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
        How to play
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      {children}
      <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pb-4 pl-5 text-base">
        {game.howToPlay.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

/** A game on the home page, as a sticker: what it is, how long, and (folded) an example and how to play. */
export function GameCard({ game, tilt = "left" }: { game: GameMeta; tilt?: "left" | "right" }) {
  const headingId = `game-${game.key}`;
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        game.className,
        "sticker-card flex flex-col gap-4 p-5 transition-transform duration-200 hover:-translate-y-1 hover:rotate-0",
        tilt === "left" ? "-rotate-1" : "rotate-1",
      )}
    >
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="bg-mode-gradient grid size-16 shrink-0 rotate-[-6deg] place-items-center rounded-2xl border-2 border-(--us-ink) text-4xl shadow-[3px_3px_0_0_var(--us-ink)]"
        >
          {game.emoji}
        </span>
        <h3 id={headingId} className="font-heading min-w-0 text-2xl leading-tight font-extrabold">
          {game.name}
        </h3>
      </header>
      <p className="flex flex-wrap gap-1.5 text-sm font-semibold">
        <span className="rounded-full bg-white/10 px-2.5 py-0.5">👥 {game.players}</span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5">⏱ {game.duration}</span>
      </p>
      <p className="text-lg">{game.pitch}</p>
      <HowToPlay game={game}>
        <figure className="border-mode-gradient mb-3 rounded-2xl p-4">
          <figcaption className="text-muted-foreground mb-1 text-sm font-semibold tracking-wide uppercase">
            {game.example.label}
          </figcaption>
          {game.example.lines.map((line) => (
            <p key={line} className="text-base">
              {line}
            </p>
          ))}
        </figure>
      </HowToPlay>
      <Link href={createHref(game.key)} className={cn(buttonVariants({ size: "lg" }), "press-3d w-full")}>
        Play {game.name}
      </Link>
    </article>
  );
}
