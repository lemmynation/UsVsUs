import type { GameView } from "@/types/game";

export function QuestionProgress({ game }: { game: GameView }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-base font-semibold">
        Round {game.roundIndex + 1} · Question {game.questionIndex + 1} of {game.questionCount}
      </p>
      <div
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Round progress"
        aria-valuemin={0}
        aria-valuemax={game.questionCount}
        aria-valuenow={game.questionIndex + 1}
      >
        <div
          className="bg-mode-gradient h-full rounded-full transition-[width] duration-300"
          style={{ width: `${((game.questionIndex + 1) / Math.max(1, game.questionCount)) * 100}%` }}
        />
      </div>
    </div>
  );
}
