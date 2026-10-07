"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { useRoom, type RealtimeConfig } from "@/hooks/use-room";
import { ApiError, apiFetch } from "@/lib/client-api";
import { MODE_META } from "@/lib/modes";
import { errorMessage } from "@/lib/rooms/errors";
import { cn } from "@/lib/utils";
import type { RoomView } from "@/types/room";
import { InvitePanel } from "./invite-panel";
import { PlayerAvatar } from "./player-avatar";
import { StatusCard } from "./status-card";

export function Lobby({ initialView, realtime }: { initialView: RoomView; realtime: RealtimeConfig | null }) {
  const router = useRouter();
  const { view, error, refresh } = useRoom(initialView, realtime);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const { room, players, me } = view;
  const meta = MODE_META[room.mode];
  const host = players.find((p) => p.isHost);
  const missing = Math.max(0, room.minPlayers - players.length);

  async function act(key: string, path: string, body?: unknown, { refreshAfter = true } = {}) {
    if (pending) return false;
    setPending(key);
    setActionError(null);
    try {
      await apiFetch(path, { method: "POST", body: body ?? {} });
      if (refreshAfter) await refresh();
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : errorMessage("unknown"));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function leave() {
    if (!window.confirm("Leave this room?")) return;
    // No refresh: we're no longer a member, so it would flash "Room unavailable".
    if (await act("leave", `/api/rooms/${room.id}/leave`, undefined, { refreshAfter: false })) router.push("/");
  }

  async function kick(playerId: string, nickname: string) {
    if (!window.confirm(`Remove ${nickname} from the room?`)) return;
    await act(`kick:${playerId}`, `/api/rooms/${room.id}/kick`, { playerId });
  }

  if (error === "kicked") {
    return <StatusCard emoji="👋" title="You were removed" message={errorMessage("kicked")} />;
  }
  if (error) {
    return <StatusCard emoji="🤔" title="Room unavailable" message={errorMessage(error)} />;
  }
  if (room.status === "EXPIRED") {
    return <StatusCard emoji="⌛" title="Room expired" message={errorMessage("room_expired")} />;
  }
  if (room.status === "ABANDONED" || room.status === "COMPLETED") {
    return <StatusCard emoji="🚪" title="Room closed" message={errorMessage("room_closed")} />;
  }

  return (
    <div className={cn(meta.className, "flex flex-1 flex-col gap-6")}>
      <header className="flex items-center justify-between gap-3">
        <Wordmark />
        <span className="bg-mode-gradient rounded-full px-3 py-1 text-sm font-semibold text-[oklch(0.18_0.04_300)]">
          {meta.emoji} {meta.label}
        </span>
      </header>

      {room.status === "IN_GAME" ? (
        <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span aria-hidden className="text-6xl">
            🎉
          </span>
          <h1 className="font-heading text-4xl font-extrabold">Game on!</h1>
          <p className="text-muted-foreground max-w-xs text-lg">
            Everyone&apos;s in. Question rounds arrive in the next build — hang tight.
          </p>
        </section>
      ) : (
        <>
          <div>
            <p className="text-muted-foreground text-base">{room.name ? "Lobby" : `${meta.label} lobby`}</p>
            <h1 className="font-heading text-4xl font-extrabold break-words">{room.name ?? "Waiting room"}</h1>
          </div>

          <InvitePanel roomId={room.id} joinCode={room.joinCode} />

          <section aria-labelledby="players-heading" className="flex flex-col gap-3">
            <h2 id="players-heading" className="flex items-baseline justify-between text-lg font-semibold">
              Players
              <span className="text-muted-foreground text-base font-normal" data-testid="player-count">
                {players.length}/{room.maxPlayers}
              </span>
            </h2>
            <ul className="flex flex-col gap-2" aria-live="polite">
              {players.map((p) => (
                <li key={p.id} className="bg-card flex items-center gap-3 rounded-2xl p-3">
                  <PlayerAvatar nickname={p.nickname} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-lg font-semibold">
                      {p.nickname}
                      {p.id === me.playerId && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      {p.isHost && <span>👑 Host ·</span>}
                      <span
                        aria-hidden
                        className={cn("size-2 rounded-full", p.isOnline ? "bg-emerald-400" : "bg-muted-foreground/50")}
                      />
                      {p.isOnline ? "Here" : "Away"}
                    </span>
                  </span>
                  {me.isHost && p.id !== me.playerId && (
                    <Button
                      variant="ghost"
                      onClick={() => kick(p.id, p.nickname)}
                      disabled={pending !== null}
                      aria-label={`Remove ${p.nickname}`}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {actionError && (
            <p role="alert" className="text-destructive text-base">
              {actionError}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3">
            {me.isHost ? (
              <>
                <Button
                  size="lg"
                  onClick={() => act("start", `/api/rooms/${room.id}/start`)}
                  disabled={missing > 0 || pending !== null}
                  aria-describedby="start-hint"
                >
                  {pending === "start" ? "Starting…" : "Start game"}
                </Button>
                <p id="start-hint" className="text-muted-foreground text-center text-base" aria-live="polite">
                  {missing > 0
                    ? `Waiting for ${missing} more player${missing === 1 ? "" : "s"} to join.`
                    : "Everyone ready? Let's go."}
                </p>
              </>
            ) : (
              <p className="bg-card rounded-2xl p-4 text-center text-lg" aria-live="polite">
                Waiting for <strong>{host?.nickname ?? "the host"}</strong> to start…
              </p>
            )}
            <Button variant="ghost" onClick={leave} disabled={pending !== null}>
              Leave room
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
