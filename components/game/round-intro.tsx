import { GAME_TYPE_META } from "@/lib/game/presentation";
import { HostAdvance } from "./host-button";
import type { GameScreenProps } from "./types";

/** S06: round title, one-line rules, progress. */
export function RoundIntro(props: GameScreenProps) {
  const { game } = props.view;
  const meta = GAME_TYPE_META[game.gameType];
  return (
    <>
      <section className="animate-in fade-in zoom-in-95 flex flex-1 flex-col items-center justify-center gap-4 text-center duration-500">
        <p className="text-muted-foreground text-lg font-semibold">
          Round {game.roundIndex + 1} of {game.roundCount}
        </p>
        <span aria-hidden className="text-7xl">
          {meta.emoji}
        </span>
        <h1 className="font-heading text-mode-gradient text-5xl font-extrabold">{meta.title}</h1>
        <p className="max-w-xs text-lg">{meta.rules}</p>
        <p className="text-muted-foreground text-base">{game.questionCount} questions</p>
      </section>
      <HostAdvance {...props} label="Start round" waitingFor="to start the round" />
    </>
  );
}
