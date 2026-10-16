import { GAME_TYPE_META, roundRules } from "@/lib/game/presentation";
import { findPack } from "@/lib/premium/catalog";
import { HostAdvance } from "./host-button";
import type { GameScreenProps } from "./types";
import { VersusClash } from "./versus-clash";

/** S06: round title, one-line rules, progress. */
export function RoundIntro(props: GameScreenProps) {
  const { game, room } = props.view;
  const meta = GAME_TYPE_META[game.gameType];
  const pack = game.packSlug ? findPack(game.packSlug) : undefined;
  return (
    <>
      <section className="animate-in fade-in zoom-in-95 flex flex-1 flex-col items-center justify-center gap-4 text-center duration-500">
        {pack && (
          <span className="bg-mode-gradient rounded-full px-3 py-1 text-sm font-bold text-[oklch(0.18_0.04_300)]">
            {pack.emoji} {pack.name}
          </span>
        )}
        <p className="text-muted-foreground text-lg font-semibold">
          Round {game.roundIndex + 1} of {game.roundCount}
        </p>
        <VersusClash view={props.view} />
        <span aria-hidden className="text-7xl">
          {meta.emoji}
        </span>
        <h1 className="font-heading text-mode-gradient text-5xl font-extrabold">{meta.title}</h1>
        <p className="max-w-xs text-lg">{roundRules(game.gameType, room.mode)}</p>
        <p className="text-muted-foreground text-base">{game.questionCount} questions</p>
      </section>
      <HostAdvance {...props} label="Start round" waitingFor="to start the round" />
    </>
  );
}
