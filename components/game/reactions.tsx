"use client";

import { createContext, useContext } from "react";
import type { FloatingReaction } from "@/hooks/use-room";
import { REACTIONS, type Reaction } from "@/lib/realtime/channel";
import { cn } from "@/lib/utils";

/** Lets any game screen show the reaction bar without threading props through every step. */
export const ReactionsContext = createContext<((emoji: Reaction) => void) | null>(null);

const LABELS: Record<Reaction, string> = {
  "😂": "Laugh",
  "🔥": "Fire",
  "😳": "Shocked",
  "💀": "Dead",
  "😍": "Love it",
  "👏": "Clap",
};

/** Tap to send an anonymous emoji that floats up on everyone's phone. */
export function ReactionBar({ className }: { className?: string }) {
  const send = useContext(ReactionsContext);
  if (!send) return null;
  return (
    <div role="group" aria-label="React" className={cn("flex justify-between gap-1", className)}>
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React: ${LABELS[emoji]}`}
          onClick={() => send(emoji)}
          className="bg-card hover:bg-muted focus-visible:ring-ring/50 flex size-12 items-center justify-center rounded-full text-2xl transition-transform outline-none focus-visible:ring-3 active:scale-90"
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}

/** Reactions from everyone in the room, rising from the bottom of the screen. */
export function FloatingReactions({ items }: { items: FloatingReaction[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {items.map((r) => (
        <span key={r.id} className="float-reaction absolute bottom-6 text-4xl" style={{ left: `${r.left}%` }}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
