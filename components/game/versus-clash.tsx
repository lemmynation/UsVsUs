import { clashSides } from "@/lib/game/presentation";
import { cn } from "@/lib/utils";
import type { RoomView } from "@/types/room";

function Side({ label, side }: { label: string; side: "pink" | "blue" }) {
  return (
    <span
      className={cn(
        "font-heading min-w-0 flex-1 truncate rounded-2xl border-2 border-(--us-ink) px-3 py-2 text-xl font-extrabold text-(--us-ink) shadow-[3px_3px_0_0_var(--us-ink)]",
        side === "pink" ? "us-in-left -rotate-3 bg-(--us-pink)" : "us-in-right rotate-3 bg-(--us-blue)",
      )}
    >
      {label}
    </span>
  );
}

/**
 * The round intro's face-off: both sides slide in, the VS badge slams down and
 * the row shakes on impact. Reduced motion: it simply shows the row.
 */
export function VersusClash({ view }: { view: RoomView }) {
  const [left, right] = clashSides(view.room.mode, view.players, view.me.playerId);
  return (
    <p className="clash-shake flex w-full max-w-sm items-center gap-2">
      <Side label={left} side="pink" />
      <span
        className="vs-slam grid size-12 shrink-0 place-items-center rounded-full bg-(--us-yellow) text-lg font-extrabold text-(--us-ink) ring-4 ring-(--us-ink)"
      >
        vs
      </span>
      <Side label={right} side="blue" />
    </p>
  );
}
