import { HostAdvance } from "./host-button";
import type { GameScreenProps } from "./types";

/** S10 between rounds. Scores and standings arrive with scoring in Phase 3. */
export function RoundEnd(props: GameScreenProps) {
  const { game } = props.view;
  const lastRound = game.roundIndex + 1 >= game.roundCount;
  return (
    <>
      <section className="animate-in fade-in zoom-in-95 flex flex-1 flex-col items-center justify-center gap-4 text-center duration-500">
        <span aria-hidden className="text-7xl">
          {lastRound ? "🏁" : "🎉"}
        </span>
        <h1 className="font-heading text-4xl font-extrabold">Round {game.roundIndex + 1} done!</h1>
        <p className="text-muted-foreground max-w-xs text-lg">
          {lastRound
            ? "That was the last round."
            : `${game.roundCount - game.roundIndex - 1} more round${game.roundCount - game.roundIndex - 1 === 1 ? "" : "s"} to go.`}
        </p>
      </section>
      <HostAdvance
        {...props}
        label={lastRound ? "Finish game" : "Next round"}
        waitingFor={lastRound ? "to finish" : "to start the next round"}
      />
    </>
  );
}
