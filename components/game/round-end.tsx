import { HostAdvance } from "./host-button";
import { Badges, Standings } from "./standings";
import type { GameScreenProps } from "./types";

/** S10: standings between rounds (2-player) or badges so far (Circle). */
export function RoundEnd(props: GameScreenProps) {
  const { game, room } = props.view;
  const lastRound = game.roundIndex + 1 >= game.roundCount;
  const left = game.roundCount - game.roundIndex - 1;
  return (
    <>
      <section className="animate-in fade-in zoom-in-95 flex flex-col items-center gap-2 text-center duration-500">
        <span aria-hidden className="text-6xl">
          {lastRound ? "🏁" : "🎉"}
        </span>
        <h1 className="font-heading text-4xl font-extrabold">Round {game.roundIndex + 1} done!</h1>
        <p className="text-muted-foreground text-lg">
          {lastRound ? "That was the last round." : `${left} more round${left === 1 ? "" : "s"} to go.`}
        </p>
      </section>
      <section aria-labelledby="standings-heading" className="flex flex-col gap-3">
        <h2 id="standings-heading" className="text-lg font-semibold">
          {room.mode === "circle" ? "Badges so far" : "Game Score"}
        </h2>
        {room.mode === "circle" ? <Badges view={props.view} /> : <Standings view={props.view} showRound />}
      </section>
      <div className="mt-auto flex flex-col">
        <HostAdvance
          {...props}
          label={lastRound ? "Finish game" : "Next round"}
          waitingFor={lastRound ? "to finish" : "to start the next round"}
        />
      </div>
    </>
  );
}
