"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { PlayerAvatar } from "@/components/room/player-avatar";
import { Button } from "@/components/ui/button";
import { isTwoPlayer } from "@/lib/game/engines";
import { cn } from "@/lib/utils";
import type { PlayerAnswer, QuestionOption } from "@/types/game";
import { playerNames } from "./names";
import { QuestionProgress } from "./question-progress";
import type { GameScreenProps } from "./types";

/** S07 question + S08 "locked in" waiting state, for every game type. */
export function QuestionScreen({ view, act, pending }: GameScreenProps) {
  const { room, game, me, players } = view;
  const { nicknameOf, labelOf, partnerOf } = playerNames(view);
  // This or That in 2-player modes is two taps: your pick, then your guess of your partner's.
  const [ownPick, setOwnPick] = useState<string | null>(null);
  const [sending, setSending] = useState<PlayerAnswer | null>(null);
  const question = game.question;
  if (!question) return null;

  const predicting = game.gameType === "this_or_that" && isTwoPlayer(room.mode);
  const partner = partnerOf(me.playerId);
  const mine = game.myAnswer ?? sending;
  const lockedIn = game.myAnswer !== null;
  const answered = new Set(game.answeredPlayerIds);
  const waitingOn = players.filter((p) => !answered.has(p.id));

  async function submit(answer: PlayerAnswer) {
    if (lockedIn || sending) return;
    setSending(answer);
    const ok = await act("answer", `/api/rooms/${room.id}/answer`, { questionId: question!.id, answer });
    if (!ok) setSending(null);
  }

  function choose(optionId: string) {
    if (game.gameType === "most_likely") return submit({ targetPlayerId: optionId });
    if (!predicting) return submit({ optionId });
    if (!ownPick) return setOwnPick(optionId);
    return submit({ optionId: ownPick, predictionId: optionId });
  }

  // Which option to highlight, and the step's instruction.
  let selectedId: string | null = null;
  let instruction: string | null = null;
  if (mine?.skipped) {
    selectedId = null;
  } else if (game.gameType === "most_likely") {
    selectedId = mine?.targetPlayerId ?? null;
  } else if (predicting) {
    selectedId = mine ? (mine.predictionId ?? null) : null;
    instruction = mine
      ? `You picked ${question.options.find((o) => o.id === mine.optionId)?.label}. Your guess for ${partner?.nickname ?? "your partner"}:`
      : ownPick
        ? `You picked ${question.options.find((o) => o.id === ownPick)?.label}. Now guess ${partner?.nickname ?? "your partner"}'s pick:`
        : "Step 1: your own pick";
  } else {
    selectedId = mine?.optionId ?? null;
  }

  if (game.myRole === "subject")
    instruction = `It's about you — answer honestly. ${partner?.nickname ?? "Your partner"} is guessing.`;
  if (game.myRole === "predictor") instruction = `Guess what ${nicknameOf(question.subjectPlayerId ?? "")} picks`;
  if (game.gameType === "most_likely" && !isTwoPlayer(room.mode)) instruction = "Your vote is anonymous.";

  return (
    <>
      <QuestionProgress game={game} />
      <h1 className="font-heading animate-in fade-in slide-in-from-bottom-2 text-4xl font-extrabold break-words duration-300">
        {question.prompt}
      </h1>
      {instruction && (
        <p className="text-muted-foreground -mt-2 text-lg" aria-live="polite">
          {instruction}
        </p>
      )}

      <div
        className="flex flex-col gap-3"
        role="group"
        aria-label={predicting && ownPick && !lockedIn ? "Your guess" : "Answers"}
      >
        {question.options.map((option) => (
          <AnswerButton
            key={option.id}
            option={option}
            player={
              game.gameType === "most_likely" ? { nickname: option.label, isMe: option.id === me.playerId } : null
            }
            selected={selectedId === option.id}
            dimmed={lockedIn && selectedId !== option.id}
            disabled={lockedIn || sending !== null}
            onClick={() => choose(option.id)}
          />
        ))}
      </div>

      {!lockedIn && (
        <div className="flex gap-3">
          {predicting && ownPick && (
            <Button variant="ghost" className="flex-1" onClick={() => setOwnPick(null)} disabled={sending !== null}>
              Change my pick
            </Button>
          )}
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => submit({ skipped: true })}
            disabled={sending !== null}
          >
            Skip this one
          </Button>
        </div>
      )}

      <section aria-live="polite" className="bg-card flex flex-col gap-3 rounded-2xl p-4">
        <p className="text-lg font-semibold">
          {lockedIn
            ? `${mine?.skipped ? "⏭️ Skipped." : "🔒 Locked in!"} ${waitingOn.length > 0 ? `Waiting for ${waitingOn.length} more…` : "Revealing…"}`
            : `${answered.size} of ${players.length} answered`}
        </p>
        <ul className="flex flex-wrap gap-3" aria-label="Who has answered">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <PlayerAvatar
                nickname={p.nickname}
                className={cn("size-9 text-sm", !answered.has(p.id) && "opacity-40")}
              />
              <span className="text-sm">
                {labelOf(p.id)}
                <span className="text-muted-foreground"> {answered.has(p.id) ? "✓ answered" : "thinking…"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Only for a big group waiting on a straggler: in 2-player games, revealing early just
          throws away the question (and a partner who's really gone is handled by host hand-off). */}
      {me.isHost && room.mode === "circle" && waitingOn.length > 0 && answered.size * 2 >= players.length && (
        <Button
          variant="secondary"
          className="mt-auto"
          disabled={pending !== null}
          onClick={() => act("advance", `/api/rooms/${room.id}/advance`, { stateVersion: game.stateVersion })}
        >
          Reveal now (don&apos;t wait)
        </Button>
      )}
    </>
  );
}

function AnswerButton({
  option,
  player,
  selected,
  dimmed,
  disabled,
  onClick,
}: {
  option: QuestionOption;
  player: { nickname: string; isMe: boolean } | null;
  selected: boolean;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-3xl border-2 px-5 py-4 text-left text-2xl font-bold transition-all duration-200",
        "focus-visible:ring-ring/60 focus-visible:ring-3 focus-visible:outline-none",
        selected
          ? "bg-mode-gradient border-transparent text-[oklch(0.18_0.04_300)]"
          : "bg-card border-border enabled:hover:border-ring enabled:active:scale-[0.98]",
        dimmed && "opacity-50",
      )}
    >
      {player && <PlayerAvatar nickname={player.nickname} />}
      <span className="flex-1 break-words">
        {option.label}
        {player?.isMe && <span className="font-normal opacity-70"> (you)</span>}
      </span>
      {selected && <Check aria-hidden className="size-7 shrink-0" />}
    </button>
  );
}
