"use client";

import { Maximize } from "lucide-react";
import { useSyncExternalStore } from "react";
import { TITLE_EMOJI } from "@/components/chaos/chaos-reveal";
import { useSecondsLeft } from "@/components/chaos/chaos-screen";
import { LayersView } from "@/components/chaos/layers-view";
import { FloatingReactions } from "@/components/game/reactions";
import { Button } from "@/components/ui/button";
import { useSpectator } from "@/hooks/use-spectator";
import type { RealtimeConfig } from "@/hooks/use-room";
import type { ChainReveal, ChaosSpectatorView } from "@/lib/chaos/projections";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";
import type { SpectatorView } from "@/types/party";
import { QrCode } from "./qr-code";

const noSubscribe = () => () => {};
const useHost = () =>
  useSyncExternalStore(
    noSubscribe,
    () => window.location.host,
    () => "",
  );
const useOrigin = () =>
  useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );

const mmss = (s: number | null) => (s === null ? "–:––" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/**
 * The Party Screen: a TV or laptop showing the public side of a Mutation Machine room
 * (docs/usvsus-4/08, TV). Nothing to tap but fullscreen; phones stay the controllers.
 */
export function PartyScreen({ realtime }: { realtime: RealtimeConfig | null }) {
  const { state, reconnecting, floating, newCode } = useSpectator(realtime);
  const view = state.kind === "paired" ? state.view : null;

  return (
    <main
      className={cn(
        view && MODE_META[view.room.mode].className,
        "flex min-h-dvh w-full flex-col gap-[3vh] px-[5vw] py-[5vh] text-[clamp(1rem,1.6vw,2rem)]",
      )}
    >
      <header className="flex items-center justify-between gap-6">
        <p className="text-muted-foreground font-semibold tracking-widest uppercase">Us vs. Us · Mutation Machine</p>
        <div className="flex items-center gap-4">
          {view && (
            <p className="font-semibold">
              Room <span className="font-mono tracking-[0.2em]">{view.room.joinCode}</span>
            </p>
          )}
          <FullscreenButton />
        </div>
      </header>

      {state.kind === "loading" && <Centered title="Getting ready…" />}
      {state.kind === "error" && (
        <Centered title="Couldn't get a code" message="Trying again in a moment. Check this screen's internet." />
      )}
      {state.kind === "ended" && (
        <Centered
          title="🏁 This room has ended"
          message="Thanks for playing! Start a new room on a phone to play again."
        >
          <Button size="lg" onClick={newCode}>
            Show a new code
          </Button>
        </Centered>
      )}
      {state.kind === "pairing" && <Pairing code={state.code} expiresAt={state.expiresAt} revoked={state.revoked} />}
      {view && <Stage view={view} />}

      <FloatingReactions items={floating} />
      {reconnecting && (
        <div role="status" className="fixed inset-x-0 bottom-[5vh] flex justify-center">
          <p className="bg-card rounded-full px-8 py-3 font-semibold shadow-lg">
            Reconnecting… the game carries on on the phones.
          </p>
        </div>
      )}
    </main>
  );
}

function Centered({ title, message, children }: { title: string; message?: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      <h1 className="font-heading text-[clamp(2rem,5vw,5rem)] font-extrabold">{title}</h1>
      {message && <p className="text-muted-foreground max-w-[60ch]">{message}</p>}
      {children}
    </section>
  );
}

function FullscreenButton() {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  if (!supported) return null;
  return (
    <Button
      variant="ghost"
      onClick={() =>
        document.fullscreenElement
          ? void document.exitFullscreen()
          : void document.documentElement.requestFullscreen().catch(() => {})
      }
    >
      <Maximize aria-hidden /> Fullscreen
    </Button>
  );
}

function Pairing({ code, expiresAt, revoked }: { code: string; expiresAt: string; revoked: boolean }) {
  const left = useSecondsLeft(expiresAt);
  const host = useHost();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      {revoked && (
        <p role="status" className="bg-card rounded-full px-6 py-2">
          The host disconnected this screen. Connect again with the new code.
        </p>
      )}
      <h1 className="font-heading text-[clamp(1.75rem,3.5vw,3.5rem)] font-extrabold">Connect this screen</h1>
      <p
        className="font-mono text-[clamp(4rem,13vw,12.5rem)] leading-none font-bold tracking-[0.15em]"
        data-testid="tv-code"
        aria-label={`Code: ${code.split("").join(" ")}`}
      >
        {code}
      </p>
      <p className="text-[clamp(1.25rem,2.4vw,2.5rem)]">
        On the host&apos;s phone: <strong>Mutation Machine lobby → Connect a TV</strong>, then type this code.
      </p>
      <p className="text-muted-foreground" aria-live="off">
        New code in {mmss(left)}
      </p>
      <p className="text-muted-foreground mt-[2vh]">
        No room yet? Start one on a phone at <strong>{host || "this site"}</strong>.
      </p>
    </section>
  );
}

function Stage({ view }: { view: SpectatorView }) {
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.nickname ?? "Someone who left";
  const chaos = view.chaos;
  if (!chaos) return <TvLobby view={view} />;
  if (chaos.phase === "STEP_OPEN") return <TvStep chaos={chaos} />;
  if (chaos.phase === "REVEAL" && chaos.reveal) {
    return <TvReveal reveal={chaos.reveal} chainCount={chaos.chainCount} nameOf={nameOf} />;
  }
  return <TvRecap chaos={chaos} nameOf={nameOf} hostName={view.players.find((p) => p.isHost)?.nickname} />;
}

function TvLobby({ view }: { view: SpectatorView }) {
  const origin = useOrigin();
  const host = useHost();
  const joinUrl = `${origin}/join/${view.room.joinCode}`;
  const missing = Math.max(0, view.room.minPlayers - view.players.length);
  const hostName = view.players.find((p) => p.isHost)?.nickname ?? "the host";
  return (
    <section className="grid flex-1 grid-cols-[auto_1fr] items-center gap-[5vw]">
      <div className="flex flex-col items-center gap-3">
        {origin && (
          <QrCode
            value={joinUrl}
            label={`QR code to join room ${view.room.joinCode}`}
            className="size-[min(32vw,48vh)] rounded-3xl"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-[3vh]">
        <div>
          <h1 className="font-heading text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold break-words">
            {view.room.name ?? "Scan to join"}
          </h1>
          <p className="text-[clamp(1.25rem,2.2vw,2.25rem)]">
            {view.room.name ? "Scan to join, or go to " : "or go to "}
            <strong className="break-all">{host}/join</strong> · code{" "}
            <strong className="font-mono tracking-[0.15em]">{view.room.joinCode}</strong>
          </p>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label="Players" aria-live="polite">
          {view.players.map((p) => (
            <li key={p.id} className="bg-card flex items-center gap-3 rounded-full px-5 py-2 font-semibold">
              <span
                aria-hidden
                className={cn("size-3 rounded-full", p.isOnline ? "bg-emerald-400" : "bg-muted-foreground/50")}
              />
              {p.nickname}
              {p.isHost && <span aria-label="host"> 👑</span>}
            </li>
          ))}
        </ul>
        <p className="text-[clamp(1.25rem,2.2vw,2.25rem)]" aria-live="polite">
          {missing > 0
            ? `Waiting for ${missing} more player${missing === 1 ? "" : "s"}…`
            : `Waiting for ${hostName} to start…`}
        </p>
      </div>
    </section>
  );
}

const STEP_COPY: Record<string, { title: string; hint: string }> = {
  create: { title: "✏️ Draw your thing!", hint: "Everyone draws the secret thing on their phone." },
  mutate: { title: "🧬 Secret mutations!", hint: "Each of you is quietly changing someone else's drawing." },
  detect: { title: "🔎 Detective time", hint: "What changed? Lock in your guesses on your phone." },
};

function TvStep({ chaos }: { chaos: ChaosSpectatorView }) {
  const step = chaos.step!;
  const left = useSecondsLeft(step.deadline);
  const copy = STEP_COPY[step.kind];
  const progress = chaos.progress ?? { done: 0, total: 0 };
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[4vh] text-center">
      <p className="text-muted-foreground font-semibold">
        Step {step.index} of {step.count}
      </p>
      <h1 className="font-heading text-[clamp(2.5rem,6vw,6rem)] font-extrabold">{copy.title}</h1>
      <p className="text-[clamp(1.25rem,2.4vw,2.5rem)]">{copy.hint}</p>
      <p
        className="font-heading text-[clamp(4rem,12vw,11rem)] leading-none font-extrabold tabular-nums"
        aria-label={left === null ? undefined : left > 0 ? `${left} seconds left` : "Time's up"}
      >
        {left === 0 ? "Time's up" : mmss(left)}
      </p>
      <div className="flex w-full max-w-[60vw] flex-col gap-3" aria-live="polite">
        <p className="text-[clamp(1.25rem,2.4vw,2.5rem)] font-semibold">
          {progress.done} of {progress.total} in
        </p>
        <div className="bg-card h-4 w-full overflow-hidden rounded-full" aria-hidden>
          <div
            className="bg-mode-gradient h-full transition-[width] duration-500"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <p className="text-muted-foreground">📱 Look at your phone</p>
    </section>
  );
}

function TvReveal({
  reveal,
  chainCount,
  nameOf,
}: {
  reveal: ChainReveal;
  chainCount: number;
  nameOf: (id: string) => string;
}) {
  const upTo = (step: number) => reveal.layers.filter((l) => l.step <= step);
  const spotted = (step: number) => {
    const ds = reveal.detections.filter((d) => d.step === step && d.mutationRight !== null);
    return { right: ds.filter((d) => d.mutationRight).length, total: ds.length };
  };
  const guessed = reveal.detections.filter((d) => d.step === 3 && d.objectRight !== null);
  const headline = [reveal.object.label, ...reveal.mutations.map((m) => `+ ${m.label}`)].join(" → ");

  return (
    <section className="flex flex-1 flex-col gap-[3vh]">
      <div className="text-center">
        <p className="text-muted-foreground font-semibold">
          Chain {reveal.chain + 1} of {chainCount} · the reveal
        </p>
        <h1 className="font-heading text-[clamp(1.75rem,3.5vw,3.5rem)] font-extrabold">{headline}</h1>
      </div>
      <ol className="flex flex-1 items-start justify-center gap-[2vw]" aria-label="How this chain evolved">
        <TvLayer
          title={
            <>
              It started as… <span className="text-mode-gradient">{reveal.object.label}</span>
            </>
          }
          by={`drawn by ${nameOf(reveal.creatorId)}`}
          stat={
            guessed.length > 0
              ? `🔎 ${guessed.filter((d) => d.objectRight).length} of ${guessed.length} guessed it`
              : null
          }
        >
          <LayersView layers={upTo(1)} label={`The original ${reveal.object.label}`} />
        </TvLayer>
        {reveal.mutations.map((m) => {
          const s = spotted(m.step === 2 ? 3 : 5);
          return (
            <TvLayer
              key={m.id}
              title={
                <>
                  + <span className="text-mode-gradient">{m.label}</span>
                </>
              }
              by={`secret mutation by ${nameOf(m.mutatorId)}`}
              stat={s.total > 0 ? `🔎 ${s.right} of ${s.total} spotted it` : null}
            >
              <LayersView layers={upTo(m.step)} label={`After ${m.label}`} />
            </TvLayer>
          );
        })}
      </ol>
    </section>
  );
}

function TvLayer({
  title,
  by,
  stat,
  children,
}: {
  title: React.ReactNode;
  by: string;
  stat: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="flex w-[min(28vw,52vh)] flex-col gap-2">
      <h2 className="font-heading text-[clamp(1.25rem,2.2vw,2.25rem)] font-extrabold">{title}</h2>
      <p className="text-muted-foreground">{by}</p>
      {children}
      {stat && <p className="font-semibold">{stat}</p>}
    </li>
  );
}

function TvRecap({
  chaos,
  nameOf,
  hostName,
}: {
  chaos: ChaosSpectatorView;
  nameOf: (id: string) => string;
  hostName: string | undefined;
}) {
  const recap = chaos.recap;
  if (!recap) return null;
  const ranked = Object.keys(recap.titles).sort((a, b) => (recap.points[b] ?? 0) - (recap.points[a] ?? 0));
  const team = Object.values(recap.points).reduce((a, b) => a + b, 0);
  return (
    <section className="flex flex-1 flex-col items-center gap-[4vh]">
      <div className="text-center">
        <h1 className="font-heading text-[clamp(2.5rem,6vw,6rem)] font-extrabold">🏁 That&apos;s the chaos!</h1>
        {chaos.isDuo && recap.sync !== null && (
          <p className="text-[clamp(1.25rem,2.4vw,2.5rem)]">
            Team score <strong>{team}</strong> · <strong>{Math.round(recap.sync * 100)}% in sync</strong>
          </p>
        )}
      </div>
      <ol className="grid w-full max-w-[80vw] grid-cols-2 gap-[2vh_2vw]" aria-label="Titles">
        {ranked.map((id) => (
          <li key={id} className="bg-card flex items-center justify-between gap-4 rounded-3xl px-[2vw] py-[2vh]">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[clamp(1.25rem,2.4vw,2.5rem)] font-bold">{nameOf(id)}</span>
              <span className="text-muted-foreground">
                {TITLE_EMOJI[recap.titles[id]]} {recap.titles[id]}
              </span>
            </span>
            {!chaos.isDuo && (
              <span className="font-heading text-[clamp(1.75rem,3.5vw,3.5rem)] font-extrabold tabular-nums">
                {recap.points[id] ?? 0}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground">Again? {hostName ?? "The host"} can start a rematch from their phone.</p>
    </section>
  );
}
