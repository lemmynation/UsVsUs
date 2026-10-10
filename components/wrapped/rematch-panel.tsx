"use client";

import { Button } from "@/components/ui/button";
import type { GameScreenProps } from "@/components/game/types";

/**
 * One-tap Rematch (engagement phase): the host takes the whole group back to this
 * room's lobby, no new invites. Everyone else sees who they're waiting on.
 */
export function RematchPanel({ view, act, pending }: GameScreenProps) {
  const host = view.players.find((p) => p.isHost);
  if (view.me.isHost) {
    return (
      <Button
        size="lg"
        // The mode gradient sets it apart from the pink share buttons: this is the next step.
        className="bg-mode-gradient w-full text-[oklch(0.18_0.04_300)] hover:opacity-90"
        disabled={pending !== null}
        onClick={() => void act("rematch", `/api/rooms/${view.room.id}/rematch`)}
      >
        {pending === "rematch" ? "Getting everyone back…" : "🔁 Rematch with this crew"}
      </Button>
    );
  }
  return (
    <p role="status" className="text-muted-foreground text-center text-base">
      {host ? (
        <>
          Waiting for <span className="text-foreground font-semibold">{host.nickname}</span> to start a rematch…
        </>
      ) : (
        "Waiting for the host to start a rematch…"
      )}
    </p>
  );
}
