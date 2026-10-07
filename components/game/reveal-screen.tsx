import { PlayerAvatar } from "@/components/room/player-avatar";
import { revealReaction, tallyAnswers } from "@/lib/game/presentation";
import { cn } from "@/lib/utils";
import { HostAdvance } from "./host-button";
import { QuestionProgress } from "./question-progress";
import type { GameScreenProps } from "./types";

/** S09: who picked what, with a short reaction. */
export function RevealScreen(props: GameScreenProps) {
  const { room, game, me, players } = props.view;
  if (!game.question || !game.reveal) return null;

  const tally = tallyAnswers(game.question.options, game.reveal.answers);
  const nicknameOf = (id: string) => players.find((p) => p.id === id)?.nickname ?? "?";
  const labelOf = (id: string) => (id === me.playerId ? "You" : nicknameOf(id));
  const lastInRound = game.questionIndex + 1 >= game.questionCount;

  return (
    <>
      <QuestionProgress game={game} />
      <h1 className="font-heading text-3xl font-extrabold break-words">{game.question.prompt}</h1>
      <p
        className="font-heading text-mode-gradient animate-in fade-in zoom-in-90 text-3xl font-extrabold duration-700"
        aria-live="polite"
      >
        {revealReaction(room.mode, tally)}
      </p>

      <ul className="flex flex-col gap-3" aria-label="Answers">
        {tally.map(({ option, playerIds }, i) => (
          <li
            key={option.id}
            className={cn(
              "animate-in fade-in slide-in-from-bottom-4 fill-mode-both flex flex-col gap-3 rounded-3xl border-2 p-5 duration-500",
              playerIds.length > 0 ? "border-mode-gradient" : "bg-card border-border opacity-60",
            )}
            style={{ animationDelay: `${150 + i * 200}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-bold break-words">{option.label}</span>
              <span className="text-muted-foreground shrink-0 text-base">
                {playerIds.length} {playerIds.length === 1 ? "pick" : "picks"}
              </span>
            </div>
            {playerIds.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {playerIds.map((id) => (
                  <li key={id} className="flex items-center gap-2">
                    <PlayerAvatar nickname={nicknameOf(id)} className="size-9 text-sm" />
                    <span className="text-base font-semibold">{labelOf(id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col">
        <HostAdvance
          {...props}
          label={lastInRound ? "End round" : "Next question"}
          waitingFor={lastInRound ? "to end the round" : "to move on"}
        />
      </div>
    </>
  );
}
