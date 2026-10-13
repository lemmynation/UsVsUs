"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ConnectionBanner } from "@/components/game/connection-banner";
import { ChaosScreen } from "@/components/chaos/chaos-screen";
import { HowToPlay } from "@/components/home/game-card";
import { GameScreen } from "@/components/game/game-screen";
import { FloatingReactions, ReactionsContext } from "@/components/game/reactions";
import { CheckoutReturn } from "@/components/premium/checkout-return";
import { PackPicker } from "@/components/premium/pack-picker";
import { Button } from "@/components/ui/button";
import { useRoom, type RealtimeConfig } from "@/hooks/use-room";
import { ApiError, apiFetch } from "@/lib/client-api";
import { MODE_META } from "@/lib/modes";
import { seriesHeadline } from "@/lib/game/series";
import { errorMessage } from "@/lib/rooms/errors";
import { audienceFor, gameForExperience } from "@/lib/games";
import { cn } from "@/lib/utils";
import type { RoomView } from "@/types/room";
import { InvitePanel } from "./invite-panel";
import { PlayerAvatar } from "./player-avatar";
import { StatusCard } from "./status-card";

export function Lobby({ initialView, realtime }: { initialView: RoomView; realtime: RealtimeConfig | null }) {
  const router = useRouter();
  const { view, error, refresh, reconnecting, floating, sendReaction } = useRoom(initialView, realtime);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  // State updates only land on the next render; a fast double-tap gets in before that.
  // This ref locks host actions synchronously, on the first tap.
  const busy = useRef(false);
  const [packChoice, setPackChoice] = useState<string | null>(null);
  // After a payment is confirmed, pick the new pack and pull the fresh room view.
  const onUnlocked = useCallback(
    (packSlug: string) => {
      setPackChoice(packSlug);
      void refresh();
    },
    [refresh],
  );

  const { room, players, me } = view;
  const nicknameOf = (id: string) => players.find((p) => p.id === id)?.nickname ?? "Someone who left";
  const meta = MODE_META[room.mode];
  const host = players.find((p) => p.isHost);
  const missing = Math.max(0, room.minPlayers - players.length);
  const premium = view.premium;
  const unlockedPacks = premium.packs.filter((p) => p.unlocked);
  // Only an unlocked pack can be chosen; the server checks again when the game starts.
  const chosenPack = unlockedPacks.find((p) => p.slug === packChoice) ?? null;

  async function act(key: string, path: string, body?: unknown, { refreshAfter = true } = {}) {
    // Answers guard against double taps themselves, so they never wait on (or block) host actions.
    const exclusive = key !== "answer";
    if (exclusive && busy.current) return false;
    if (exclusive) {
      busy.current = true;
      setPending(key);
    }
    setActionError(null);
    try {
      await apiFetch(path, { method: "POST", body: body ?? {} });
      // Release before the follow-up refresh: on a slow connection the next screen can
      // arrive (via realtime) while that refresh is still loading, and its taps must work.
      if (exclusive) {
        busy.current = false;
        setPending(null);
      }
      if (refreshAfter) await refresh();
      return true;
    } catch (err) {
      // The game moved on under us (double tap, another host, a reveal, a second Start):
      // nothing went wrong from the player's point of view — just catch up quietly.
      const alreadyDone =
        err instanceof ApiError &&
        (err.code === "stale_state" ||
          err.code === "not_open" ||
          err.code === "step_closed" ||
          err.code === "no_match" ||
          (key === "start" && err.code === "not_in_lobby"));
      if (alreadyDone) {
        await refresh();
        return false;
      }
      // The choices changed under the player (e.g. a vote for someone who just left):
      // show the fresh choices and say why, instead of a confusing "not an option".
      if (key === "answer" && err instanceof ApiError && err.code === "invalid_answer") {
        await refresh();
        setActionError("The choices just changed (someone left). Please pick again.");
        return false;
      }
      setActionError(err instanceof ApiError ? err.message : errorMessage("unknown"));
      return false;
    } finally {
      if (exclusive) {
        busy.current = false;
        setPending(null);
      }
    }
  }

  async function leave() {
    const question =
      room.status === "IN_GAME" ? "Leave the game? You won't be able to rejoin until it ends." : "Leave this room?";
    if (!window.confirm(question)) return;
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

  const game = view.game;
  const chain = room.experience === "chain_reactions";
  const chaos = view.chaos;
  const playing = room.status === "IN_GAME" || room.status === "WRAPPED";
  const inGame = !chain && game !== null && playing;
  const inChaos = chain && chaos !== null && playing;
  const gameMeta = gameForExperience(room.experience);
  const label = audienceFor(gameMeta.key, room.mode).label;

  return (
    <div className={cn(meta.className, "flex flex-1 flex-col gap-6")}>
      <ConnectionBanner reconnecting={reconnecting} />
      <header className="flex items-center justify-between gap-3">
        <Wordmark />
        <span className="bg-mode-gradient rounded-full px-3 py-1 text-sm font-semibold text-[oklch(0.18_0.04_300)]">
          {chain ? "⚡" : meta.emoji} {label}
        </span>
      </header>

      {inChaos ? (
        <>
          <ReactionsContext.Provider value={sendReaction}>
            <ChaosScreen view={{ ...view, chaos }} act={act} pending={pending} refresh={refresh} />
          </ReactionsContext.Provider>
          <FloatingReactions items={floating} />
          {actionError && (
            <p role="alert" className="text-destructive text-base">
              {actionError}
            </p>
          )}
          {chaos.phase !== "RECAP" && (
            <Button variant="ghost" onClick={leave} disabled={pending !== null}>
              Leave game
            </Button>
          )}
        </>
      ) : inGame ? (
        <>
          <ReactionsContext.Provider value={sendReaction}>
            <GameScreen view={{ ...view, game }} act={act} pending={pending} />
          </ReactionsContext.Provider>
          <FloatingReactions items={floating} />
          {actionError && (
            <p role="alert" className="text-destructive text-base">
              {actionError}
            </p>
          )}
          {game.phase !== "FINISHED" && (
            <Button variant="ghost" onClick={leave} disabled={pending !== null}>
              Leave game
            </Button>
          )}
        </>
      ) : room.status !== "LOBBY" ? (
        <StatusCard emoji="🚪" title="Room closed" message={errorMessage("room_closed")} />
      ) : (
        <>
          <div>
            <p className="text-muted-foreground text-base">{room.name ? "Lobby" : `${label} lobby`}</p>
            <h1 className="font-heading text-4xl font-extrabold break-words">{room.name ?? "Waiting room"}</h1>
            <p className="mt-2 text-lg">
              <strong>
                {gameMeta.emoji} {gameMeta.name}:
              </strong>{" "}
              {gameMeta.pitch} About {gameMeta.duration}.
            </p>
            {chain && chaos?.phase === "RECAP" && (
              <p role="status" className="mt-2 text-base">
                🔁 <span className="font-semibold">Rematch!</span> New things to draw, new mutations.
              </p>
            )}
            {!chain && game?.phase === "FINISHED" && (
              <p role="status" className="mt-2 text-base">
                🔁 <span className="font-semibold">Rematch!</span> Same crew, fresh questions. Anyone who left can
                rejoin with the code.
                {game.series && (
                  <span className="mt-1 block font-semibold">
                    🏆 {seriesHeadline(game.series, (id) => (id === me.playerId ? "You" : nicknameOf(id)))}
                  </span>
                )}
              </p>
            )}
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

          {!chain && me.isHost && premium.enabled && (
            <>
              <CheckoutReturn roomId={room.id} pendingCheckout={premium.pendingCheckout} onUnlocked={onUnlocked} />
              <PackPicker
                roomId={room.id}
                premium={premium}
                selected={chosenPack?.slug ?? null}
                onSelect={setPackChoice}
              />
            </>
          )}
          {!chain && !me.isHost && unlockedPacks.length > 0 && (
            <p className="border-mode-gradient rounded-2xl p-4 text-center text-lg">
              {unlockedPacks.map((p) => `${p.emoji} ${p.name}`).join(" · ")} unlocked for this room
            </p>
          )}

          {/* People who came in by link never saw the home page: explain the game here too. */}
          <HowToPlay game={gameMeta} />

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
                  onClick={() =>
                    chain
                      ? act("start", `/api/rooms/${room.id}/chaos/start`, {})
                      : act("start", `/api/rooms/${room.id}/start`, { packSlug: chosenPack?.slug ?? null })
                  }
                  disabled={missing > 0 || pending !== null}
                  aria-describedby="start-hint"
                >
                  {pending === "start"
                    ? "Starting…"
                    : chain
                      ? "Start Mutation Machine"
                      : chosenPack
                        ? `Start ${chosenPack.name}`
                        : "Start game"}
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
