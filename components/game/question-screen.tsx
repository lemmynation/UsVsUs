"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/room/player-avatar";
import { cn } from "@/lib/utils";
import { QuestionProgress } from "./question-progress";
import type { GameScreenProps } from "./types";

/** S07 question + S08 "locked in" waiting state. */
export function QuestionScreen({ view, act, pending }: GameScreenProps) {
  const { room, game, me, players } = view;
  const [choosing, setChoosing] = useState<string | null>(null);
  const question = game.question;
  if (!question) return null;

  const chosen = game.myAnswer ?? choosing;
  const lockedIn = game.myAnswer !== null;
  const answered = new Set(game.answeredPlayerIds);
  const waitingOn = players.filter((p) => !answered.has(p.id));

  async function choose(optionId: string) {
    if (lockedIn || choosing) return;
    setChoosing(optionId);
    const ok = await act("answer", `/api/rooms/${room.id}/answer`, { questionId: question!.id, optionId });
    if (!ok) setChoosing(null);
  }

  return (
    <>
      <QuestionProgress game={game} />
      <h1 className="font-heading animate-in fade-in slide-in-from-bottom-2 text-4xl font-extrabold break-words duration-300">
        {question.prompt}
      </h1>

      <div className="flex flex-col gap-3" role="group" aria-label="Answers">
        {question.options.map((option) => {
          const selected = chosen === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              disabled={lockedIn || choosing !== null}
              aria-pressed={selected}
              className={cn(
                "flex min-h-20 items-center justify-between gap-3 rounded-3xl border-2 px-6 py-4 text-left text-2xl font-bold transition-all duration-200",
                "focus-visible:ring-ring/60 focus-visible:ring-3 focus-visible:outline-none",
                selected
                  ? "bg-mode-gradient border-transparent text-[oklch(0.18_0.04_300)]"
                  : "bg-card border-border enabled:hover:border-ring enabled:active:scale-[0.98]",
                lockedIn && !selected && "opacity-50",
              )}
            >
              <span className="break-words">{option.label}</span>
              {selected && <Check aria-hidden className="size-7 shrink-0" />}
            </button>
          );
        })}
      </div>

      <section aria-live="polite" className="bg-card flex flex-col gap-3 rounded-2xl p-4">
        <p className="text-lg font-semibold">
          {lockedIn
            ? `🔒 Locked in! ${waitingOn.length > 0 ? `Waiting for ${waitingOn.length} more…` : "Revealing…"}`
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
                {p.id === me.playerId ? "You" : p.nickname}
                <span className="text-muted-foreground"> {answered.has(p.id) ? "✓ answered" : "thinking…"}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {me.isHost && waitingOn.length > 0 && answered.size > 0 && (
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
