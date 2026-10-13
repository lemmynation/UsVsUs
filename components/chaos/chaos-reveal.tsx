"use client";

import { ReactionBar } from "@/components/game/reactions";
import { Button } from "@/components/ui/button";
import { RematchPanel } from "@/components/wrapped/rematch-panel";
import type { ChainReveal, Layer } from "@/lib/chaos/projections";
import type { ChaosScreenProps } from "./chaos-screen";
import { LayersView } from "./layers-view";

export const TITLE_EMOJI: Record<string, string> = {
  "Sharp Eye": "🔎",
  "Clear Signal": "📡",
  "Chaos Agent": "🌪️",
  "Mind Meld": "🧠",
  Wildcard: "🃏",
};

/** One chain's lineage, step by step: what it was, what each mutation did, who spotted it. */
export function ChaosReveal({ view, act, pending }: ChaosScreenProps) {
  const { chaos, room, me, players } = view;
  const current = chaos.reveals.at(-1);
  if (!current) return null;
  const nameOf = (id: string) =>
    id === me.playerId ? "You" : (players.find((p) => p.id === id)?.nickname ?? "Someone who left");
  const last = current.chain === chaos.chainCount - 1;

  return (
    <>
      <p className="text-muted-foreground text-base font-semibold">Chain {current.chain + 1} · the reveal</p>
      <Lineage reveal={current} nameOf={nameOf} meId={me.playerId} />
      <ReactionBar />
      {me.isHost ? (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={pending !== null}
            onClick={() =>
              act("reveal", `/api/rooms/${room.id}/chaos/advance`, {
                stateVersion: chaos.stateVersion,
                action: "reveal_next",
              })
            }
          >
            {last ? "See results" : "Next chain"}
          </Button>
          <Button
            variant="ghost"
            disabled={pending !== null}
            onClick={() =>
              act("finish", `/api/rooms/${room.id}/chaos/advance`, {
                stateVersion: chaos.stateVersion,
                action: "finish",
              })
            }
          >
            Skip to results
          </Button>
        </div>
      ) : (
        <p className="bg-card rounded-2xl p-4 text-center text-lg" aria-live="polite">
          Waiting for <strong>{players.find((p) => p.isHost)?.nickname ?? "the host"}</strong> to show the next one…
        </p>
      )}
    </>
  );
}

function Lineage({ reveal, nameOf, meId }: { reveal: ChainReveal; nameOf: (id: string) => string; meId: string }) {
  const upTo = (step: number): Layer[] => reveal.layers.filter((l) => l.step <= step);
  const spotted = (step: number) => {
    const ds = reveal.detections.filter((d) => d.step === step && d.mutationRight !== null);
    return {
      right: ds.filter((d) => d.mutationRight).length,
      total: ds.length,
      me: ds.find((d) => d.playerId === meId),
    };
  };
  const original = reveal.detections.filter((d) => d.step === 3 && d.objectRight !== null);

  return (
    <ol className="flex flex-col gap-5" aria-label="How this chain evolved">
      <li className="flex flex-col gap-2">
        <h2 className="font-heading text-2xl font-extrabold">
          It started as… <span className="text-mode-gradient">{reveal.object.label}</span>
        </h2>
        <p className="text-muted-foreground text-base">drawn by {nameOf(reveal.creatorId)}</p>
        <LayersView layers={upTo(1)} label={`The original ${reveal.object.label}`} />
        {original.length > 0 && (
          <p className="text-base">
            🔎 {original.filter((d) => d.objectRight).length} of {original.length} guessed what it was
          </p>
        )}
      </li>
      {reveal.mutations.map((m) => {
        const s = spotted(m.step === 2 ? 3 : 5);
        return (
          <li key={m.id} className="flex flex-col gap-2">
            <h2 className="font-heading text-2xl font-extrabold">
              + <span className="text-mode-gradient">{m.label}</span>
            </h2>
            <p className="text-muted-foreground text-base">secret mutation by {nameOf(m.mutatorId)}</p>
            <LayersView layers={upTo(m.step)} label={`After ${m.label}`} />
            {s.total > 0 && (
              <p className="text-base">
                🔎 {s.right} of {s.total} spotted it
                {s.me && <strong>{s.me.mutationRight ? " · you got it! 🎉" : " · not this time"}</strong>}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** End of the match: everyone's (positive) title, points or the duo's sync, rematch. */
export function ChaosRecap({ view, act, pending }: ChaosScreenProps) {
  const { chaos, me, players } = view;
  const recap = chaos.recap;
  if (!recap) return null;
  const nameOf = (id: string) =>
    id === me.playerId ? "You" : (players.find((p) => p.id === id)?.nickname ?? "Someone who left");
  const ranked = Object.keys(recap.titles).sort((a, b) => (recap.points[b] ?? 0) - (recap.points[a] ?? 0));
  const team = Object.values(recap.points).reduce((a, b) => a + b, 0);

  return (
    <>
      <header className="flex flex-col gap-1 text-center">
        <p className="text-muted-foreground text-base font-semibold tracking-widest uppercase">Mutation Machine</p>
        <h1 className="font-heading text-4xl font-extrabold">🏁 That&apos;s the chaos!</h1>
        {chaos.isDuo && recap.sync !== null && (
          <p className="text-lg">
            Team score <strong>{team}</strong> · you were <strong>{Math.round(recap.sync * 100)}% in sync</strong>
          </p>
        )}
      </header>
      <ul className="flex flex-col gap-2" aria-label="Titles">
        {ranked.map((id) => (
          <li key={id} className="bg-card flex items-center justify-between gap-3 rounded-2xl p-4">
            <span className="flex flex-col">
              <span className="text-lg font-bold">{nameOf(id)}</span>
              <span className="text-muted-foreground text-base">
                {TITLE_EMOJI[recap.titles[id]]} {recap.titles[id]}
              </span>
            </span>
            {!chaos.isDuo && (
              <span className="font-heading text-2xl font-extrabold tabular-nums">{recap.points[id] ?? 0}</span>
            )}
          </li>
        ))}
      </ul>
      <ReactionBar />
      <RematchPanel view={view} act={act} pending={pending} />
    </>
  );
}
