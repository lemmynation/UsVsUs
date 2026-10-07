"use client";

import Link from "next/link";
import { trackClient } from "@/lib/client-api";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { MODES, type Mode } from "@/types/room";

export function ModeCard({ mode }: { mode: Mode }) {
  const meta = MODE_META[mode];
  return (
    <Link
      href={`/create?mode=${mode}`}
      onClick={() => trackClient("mode_selected", { mode })}
      className={cn(
        meta.className,
        "border-mode-gradient group focus-visible:ring-ring/60 flex items-center gap-4 rounded-3xl p-5 shadow-lg shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:outline-none active:scale-[0.98]",
      )}
    >
      <span aria-hidden className="bg-mode-gradient grid size-14 shrink-0 place-items-center rounded-2xl text-3xl">
        {meta.emoji}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="font-heading text-2xl font-extrabold">{meta.label}</span>
          <span className="text-muted-foreground text-sm">{meta.players}</span>
        </span>
        <span className="text-muted-foreground text-base">{meta.tagline}</span>
      </span>
    </Link>
  );
}

export function ModePicker() {
  return (
    <ul className="flex flex-col gap-4" aria-label="Game modes">
      {MODES.map((mode) => (
        <li key={mode}>
          <ModeCard mode={mode} />
        </li>
      ))}
    </ul>
  );
}
