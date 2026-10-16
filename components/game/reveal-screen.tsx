"use client";

import { PlayerAvatar } from "@/components/room/player-avatar";
import { GradientText } from "@/components/ui/gradient-text";
import { revealHeadline, tallyAnswers } from "@/lib/game/presentation";
import { cn } from "@/lib/utils";
import type { PlayerAnswer, QuestionOption } from "@/types/game";
import { HostAdvance } from "./host-button";
import { playerNames } from "./names";
import { QuestionProgress } from "./question-progress";
import { ReactionBar } from "./reactions";
import { Callouts, Celebration, Drumroll, useDrumroll } from "./reveal-moments";
import type { GameScreenProps } from "./types";

/** S09: the reveal — answers (or anonymous votes), points, and a short reaction. */
export function RevealScreen(props: GameScreenProps) {
  const { view } = props;
  const { room, game } = view;
  const { question, reveal } = game;
  const counting = useDrumroll(game.phaseAgeMs);
  if (!question || !reveal) return null;

  if (counting) {
    return (
      <>
        <QuestionProgress game={game} />
        <h1 className="font-heading text-3xl font-extrabold break-words">{question.prompt}</h1>
        <Drumroll />
      </>
    );
  }

  const names = playerNames(view);
  const me = view.me.playerId;
  // Scored on this one, or (Circle) the room handed you the badge.
  const nailedIt = (reveal.points[me] ?? 0) > 0 || (reveal.award?.playerIds.includes(me) ?? false);
  const lastInRound = game.questionIndex + 1 >= game.questionCount;
  const optionLabel = (id?: string) => question.options.find((o) => o.id === id)?.label ?? "—";

  let body: React.ReactNode;
  if (reveal.votes) {
    body = <VoteBars votes={reveal.votes} options={question.options} names={names} />;
  } else if (game.gameType === "mind_reader") {
    body = <MindReaderResult view={view} optionLabel={optionLabel} />;
  } else if (game.gameType === "this_or_that" && room.mode !== "circle") {
    body = (
      <ul className="flex flex-col gap-3" aria-label="Answers">
        {(reveal.answers ?? []).map(({ playerId, answer }, i) => (
          <ResultCard
            key={playerId}
            playerId={playerId}
            names={names}
            points={reveal.points[playerId]}
            skipped={answer.skipped}
            delay={i}
          >
            {answer.skipped ? (
              "Skipped"
            ) : (
              <>
                Picked <strong>{optionLabel(answer.optionId)}</strong> · guessed{" "}
                <strong>{optionLabel(answer.predictionId)}</strong>
              </>
            )}
          </ResultCard>
        ))}
      </ul>
    );
  } else if (game.gameType === "most_likely") {
    body = (
      <ul className="flex flex-col gap-3" aria-label="Votes">
        {(reveal.answers ?? []).map(({ playerId, answer }, i) => (
          <ResultCard
            key={playerId}
            playerId={playerId}
            names={names}
            points={reveal.points[playerId]}
            skipped={answer.skipped}
            delay={i}
          >
            {answer.skipped ? (
              "Skipped"
            ) : (
              <>
                Picked <strong>{names.labelOf(answer.targetPlayerId!)}</strong>
              </>
            )}
          </ResultCard>
        ))}
      </ul>
    );
  } else {
    body = <GroupPicks answers={reveal.answers ?? []} options={question.options} names={names} />;
  }

  return (
    <>
      <QuestionProgress game={game} />
      <h1 className="font-heading text-3xl font-extrabold break-words">{question.prompt}</h1>
      <p className="font-heading animate-in fade-in zoom-in-90 text-3xl font-extrabold duration-700" aria-live="polite">
        <GradientText>
          {revealHeadline({
            gameType: game.gameType,
            mode: room.mode,
            reveal,
            options: question.options,
            subjectPlayerId: question.subjectPlayerId,
            nameOf: names.labelOf,
          })}
        </GradientText>
      </p>
      <Callouts moments={game.moments} nameOf={names.labelOf} />
      {nailedIt && <Celebration />}
      {body}
      <ReactionBar />
      {/* 2-player cards already say "Skipped"; group views only show who picked something. */}
      {reveal.skippedCount > 0 && room.mode === "circle" && (
        <p className="text-muted-foreground text-base">{reveal.skippedCount} skipped</p>
      )}
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

type Names = ReturnType<typeof playerNames>;

function ResultCard({
  playerId,
  names,
  points,
  showPoints = true,
  skipped = false,
  delay,
  children,
}: {
  playerId: string;
  names: Names;
  points: number | undefined;
  /** False for the Mind Reader subject, who can't score on their own question. */
  showPoints?: boolean;
  /** Skipped answers get no verdict stamp. */
  skipped?: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 fill-mode-both relative flex items-center gap-3 rounded-3xl border-2 p-4 duration-500",
        points ? "border-mode-gradient" : "bg-card border-border",
      )}
      style={{ animationDelay: `${150 + delay * 200}ms` }}
    >
      {showPoints && !skipped && <VerdictStamp hit={!!points} delayMs={550 + delay * 200} />}
      <PlayerAvatar nickname={names.nicknameOf(playerId)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-lg font-bold">{names.labelOf(playerId)}</span>
        <span className="text-base break-words">{children}</span>
      </div>
      {showPoints && <PointsBadge points={points} />}
    </li>
  );
}

/** "Nailed it" / "Missed" thuds onto the card corner once the card has landed. */
function VerdictStamp({ hit, delayMs }: { hit: boolean; delayMs: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "stamp-in absolute -top-3 right-4 rounded-lg border-2 border-(--us-ink) px-2 py-0.5 text-xs font-extrabold tracking-wide text-(--us-ink) uppercase shadow-[2px_2px_0_0_var(--us-ink)]",
        hit ? "bg-(--us-yellow)" : "bg-white",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {hit ? "✓ Nailed it" : "✗ Missed"}
    </span>
  );
}

function PointsBadge({ points }: { points: number | undefined }) {
  return points ? (
    <span className="bg-mode-gradient shrink-0 rounded-full px-3 py-1 text-base font-bold text-[oklch(0.18_0.04_300)]">
      +{points}
    </span>
  ) : (
    <span className="text-muted-foreground shrink-0 text-base">+0</span>
  );
}

function MindReaderResult({
  view,
  optionLabel,
}: {
  view: GameScreenProps["view"];
  optionLabel: (id?: string) => string;
}) {
  const { game } = view;
  const names = playerNames(view);
  const subjectId = game.question!.subjectPlayerId;
  const answers = game.reveal!.answers ?? [];
  const truth = answers.find((a) => a.playerId === subjectId)?.answer;
  const guesses = answers.filter((a) => a.playerId !== subjectId);
  const describe = (answer: PlayerAnswer) => (answer.skipped ? "Skipped" : optionLabel(answer.optionId));

  return (
    <ul className="flex flex-col gap-3" aria-label="Answers">
      {/* Subject first, then the guess, then points (design doc §6.1). */}
      <ResultCard playerId={subjectId ?? ""} names={names} points={undefined} showPoints={false} delay={0}>
        Really picked <strong>{truth ? describe(truth) : "nothing"}</strong>
      </ResultCard>
      {guesses.map(({ playerId, answer }, i) => (
        <ResultCard
          key={playerId}
          playerId={playerId}
          names={names}
          points={game.reveal!.points[playerId]}
          skipped={answer.skipped}
          delay={i + 1}
        >
          Guessed <strong>{describe(answer)}</strong>
          {!answer.skipped && truth && !truth.skipped && (answer.optionId === truth.optionId ? " ✓" : " ✗")}
        </ResultCard>
      ))}
    </ul>
  );
}

/** Circle's Who's More Likely: anonymous counts only — who voted for whom never reaches the phone. */
function VoteBars({
  votes,
  options,
  names,
}: {
  votes: Array<{ targetPlayerId: string; count: number }>;
  options: QuestionOption[];
  names: Names;
}) {
  const total = votes.reduce((n, v) => n + v.count, 0);
  const withZeros = options.map((o) => ({
    targetPlayerId: o.id,
    count: votes.find((v) => v.targetPlayerId === o.id)?.count ?? 0,
  }));
  withZeros.sort((a, b) => b.count - a.count);
  return (
    <ul className="flex flex-col gap-2" aria-label="Votes">
      {withZeros.map(({ targetPlayerId, count }, i) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <li
            key={targetPlayerId}
            className="animate-in fade-in slide-in-from-left-4 fill-mode-both bg-card relative overflow-hidden rounded-2xl p-3 duration-500"
            style={{ animationDelay: `${100 + i * 150}ms` }}
          >
            <div
              aria-hidden
              className="bg-mode-gradient absolute inset-y-0 left-0 opacity-30 transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center gap-3">
              <PlayerAvatar nickname={names.nicknameOf(targetPlayerId)} className="size-9 text-sm" />
              <span className="flex-1 text-lg font-semibold">{names.labelOf(targetPlayerId)}</span>
              <span className="text-base font-bold">
                {count} {count === 1 ? "vote" : "votes"} · {pct}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Circle's This or That: who picked what (not anonymous, like a show of hands). */
function GroupPicks({
  answers,
  options,
  names,
}: {
  answers: Array<{ playerId: string; answer: PlayerAnswer }>;
  options: QuestionOption[];
  names: Names;
}) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Answers">
      {tallyAnswers(options, answers).map(({ option, playerIds }, i) => (
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
                  <PlayerAvatar nickname={names.nicknameOf(id)} className="size-9 text-sm" />
                  <span className="text-base font-semibold">{names.labelOf(id)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
