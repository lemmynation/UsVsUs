import { Button } from "@/components/ui/button";
import type { GameScreenProps } from "./types";

/** The host's "move on" button, or a waiting note for everyone else. */
export function HostAdvance({
  view,
  act,
  pending,
  label,
  waitingFor,
}: GameScreenProps & { label: string; waitingFor: string }) {
  const { room, game, me, players } = view;
  if (!me.isHost) {
    const host = players.find((p) => p.isHost);
    return (
      <p className="bg-card rounded-2xl p-4 text-center text-lg" aria-live="polite">
        Waiting for <strong>{host?.nickname ?? "the host"}</strong> {waitingFor}…
      </p>
    );
  }
  return (
    <Button
      size="lg"
      disabled={pending !== null}
      onClick={() => act("advance", `/api/rooms/${room.id}/advance`, { stateVersion: game.stateVersion })}
    >
      {pending === "advance" ? "One sec…" : label}
    </Button>
  );
}
