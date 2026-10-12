"use client";

import { useEffect, useRef, useState } from "react";
import type { GameAction } from "@/components/game/types";
import { Button } from "@/components/ui/button";
import type { Stroke } from "@/lib/chaos/artifact";
import type { ChaosJob, ChaosPlayerView } from "@/lib/chaos/projections";
import { cn } from "@/lib/utils";
import type { RoomView } from "@/types/room";
import { ChaosRecap, ChaosReveal } from "./chaos-reveal";
import { DrawingCanvas } from "./drawing-canvas";
import { LayersView } from "./layers-view";

export interface ChaosScreenProps {
  view: RoomView & { chaos: ChaosPlayerView };
  act: GameAction;
  pending: string | null;
  /** Pull the room view now (used when a step's overtime runs out). */
  refresh?: () => void;
}

const newKey = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);

/** Mutation Machine on a phone: whatever the server says this player should be doing. */
export function ChaosScreen(props: ChaosScreenProps) {
  const { chaos } = props.view;
  if (chaos.phase === "REVEAL") return <ChaosReveal {...props} />;
  if (chaos.phase === "RECAP") return <ChaosRecap {...props} />;
  const job = chaos.myJobs.find((j) => !j.submitted);
  // Keyed per job so drafts and choices reset between jobs.
  return job ? (
    <JobScreen key={`${chaos.matchId}:${chaos.step?.index}:${job.chain}`} {...props} job={job} />
  ) : (
    <Waiting {...props} />
  );
}

function useSecondsLeft(deadline: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : 0;
}

function StepHeader({ chaos, refresh }: { chaos: ChaosPlayerView; refresh?: () => void }) {
  const left = useSecondsLeft(chaos.step?.deadline);
  const overtime = useSecondsLeft(chaos.step?.autoSkipAt);
  // Once overtime is up, ask the server: our refresh is what moves the match on if
  // nobody else's has yet. Once per step.
  const asked = useRef<string | null>(null);
  const autoSkipAt = chaos.step?.autoSkipAt;
  useEffect(() => {
    if (!autoSkipAt || overtime > 0 || asked.current === autoSkipAt) return;
    asked.current = autoSkipAt;
    refresh?.();
  }, [autoSkipAt, overtime, refresh]);
  if (!chaos.step) return null;
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground flex justify-between text-base font-semibold">
        <span>
          Step {chaos.step.index} of {chaos.step.count}
        </span>
        {left > 0 ? (
          <span aria-label={`${left} seconds left`} className={cn("tabular-nums", left <= 10 && "text-destructive")}>
            ⏱ {mm}
          </span>
        ) : (
          <span className="text-destructive tabular-nums">
            Time&apos;s up · moving on {overtime > 0 ? `in ${overtime}s` : "now"}
          </span>
        )}
      </p>
      <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-mode-gradient h-full rounded-full"
          style={{ width: `${(chaos.step.index / chaos.step.count) * 100}%` }}
        />
      </div>
    </div>
  );
}

function JobScreen({ view, act, pending, refresh, job }: ChaosScreenProps & { job: ChaosJob }) {
  const { chaos, room } = view;
  const detectJobs = chaos.myJobs.filter((j) => j.kind === "detect");
  const submit = (body: Record<string, unknown>) =>
    act("answer", `/api/rooms/${room.id}/chaos/submit`, {
      step: chaos.step!.index,
      chain: job.chain,
      idempotencyKey: newKey(),
      ...body,
    });

  return (
    <>
      <StepHeader chaos={chaos} refresh={refresh} />
      {job.kind === "detect" ? (
        <DetectJob
          job={job}
          round={chaos.step!.round}
          position={detectJobs.length > 1 ? `${detectJobs.indexOf(job) + 1} of ${detectJobs.length}` : null}
          duo={chaos.isDuo}
          busy={pending !== null}
          onSubmit={(answer) => submit({ answer })}
        />
      ) : (
        <MakeJob job={job} busy={pending !== null} onSubmit={(artifact) => submit({ artifact })} />
      )}
    </>
  );
}

/** Create or mutate: draw it, or describe it instead. */
function MakeJob({
  job,
  busy,
  onSubmit,
}: {
  job: Extract<ChaosJob, { kind: "create" | "mutate" }>;
  busy: boolean;
  onSubmit: (artifact: unknown) => void;
}) {
  const [mode, setMode] = useState<"draw" | "text">("draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [text, setText] = useState("");
  const ready = mode === "draw" ? strokes.length > 0 : text.trim().length > 0;
  const drawnBase = job.kind === "mutate" ? job.base.filter((l) => l.artifact?.medium === "drawing") : [];
  const otherBase = job.kind === "mutate" ? job.base.filter((l) => l.artifact?.medium !== "drawing") : [];

  return (
    <section aria-labelledby="job-heading" className="flex flex-col gap-4">
      {job.kind === "create" ? (
        <h1 id="job-heading" className="font-heading text-3xl font-extrabold">
          Draw this: <span className="text-mode-gradient">{job.object}</span>
        </h1>
      ) : (
        <>
          <h1 id="job-heading" className="font-heading text-3xl font-extrabold">
            Mutate this machine
          </h1>
          <div className="border-mode-gradient rounded-2xl p-4" role="note">
            <p className="text-lg font-bold">🔒 Secret: {job.mutation.label}</p>
            <p className="text-muted-foreground text-base">{job.mutation.drawHint}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Add to it — you can&apos;t erase theirs. Don&apos;t write the answer!
            </p>
          </div>
          {otherBase.length > 0 && <LayersView layers={otherBase} label="The machine so far" />}
        </>
      )}

      <div role="group" aria-label="How to answer" className="bg-muted flex gap-1 self-start rounded-xl p-1">
        {(["draw", "text"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "h-11 rounded-lg px-4 text-sm font-medium",
              mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {m === "draw" ? "✏️ Draw" : "⌨️ Describe instead"}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <DrawingCanvas
          base={drawnBase}
          strokes={strokes}
          onChange={setStrokes}
          label={job.kind === "create" ? "Your drawing" : "The machine, with your mutation"}
        />
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">
            {job.kind === "create" ? "Describe it in a few words" : "Describe how it changes"}
          </span>
          <input
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full rounded-xl border bg-transparent px-4 text-base outline-none focus-visible:ring-3"
            maxLength={80}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={job.kind === "create" ? "e.g. a fat little duck" : "e.g. now it has a huge frown"}
          />
        </label>
      )}

      <Button
        size="lg"
        disabled={!ready || busy}
        onClick={() => onSubmit(mode === "draw" ? { medium: "drawing", strokes } : { medium: "text", text })}
      >
        {busy ? "Sending…" : "Submit"}
      </Button>
    </section>
  );
}

function DetectJob({
  job,
  round,
  position,
  duo,
  busy,
  onSubmit,
}: {
  job: Extract<ChaosJob, { kind: "detect" }>;
  round: number;
  position: string | null;
  duo: boolean;
  busy: boolean;
  onSubmit: (answer: { objectId?: string; mutationId: string }) => void;
}) {
  const [objectId, setObjectId] = useState<string | null>(null);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const ready = !!mutationId && (!job.objectChoices || !!objectId);
  const question = round === 2 ? "What changed this time?" : duo ? "What did they do to it?" : "What happened to it?";

  return (
    <section aria-labelledby="detect-heading" className="flex flex-col gap-4">
      <h1 id="detect-heading" className="font-heading text-3xl font-extrabold">
        🔎 Detect{position ? ` · ${position}` : ""}
      </h1>
      <LayersView layers={job.layers} label="The finished machine" />
      {job.objectChoices && (
        <ChoiceGroup label="What was it before?" choices={job.objectChoices} value={objectId} onChange={setObjectId} />
      )}
      <ChoiceGroup label={question} choices={job.mutationChoices} value={mutationId} onChange={setMutationId} />
      <Button
        size="lg"
        disabled={!ready || busy}
        onClick={() => onSubmit({ mutationId: mutationId!, ...(objectId ? { objectId } : {}) })}
      >
        {busy ? "Locking in…" : "Lock in"}
      </Button>
    </section>
  );
}

function ChoiceGroup({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Array<{ id: string; label: string }>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <p className="text-lg font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            className={cn(
              "focus-visible:ring-ring/50 min-h-14 rounded-2xl border-2 px-3 text-base font-semibold outline-none focus-visible:ring-3",
              value === c.id ? "border-primary bg-primary/15" : "border-border bg-card",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Done with this step: who we're waiting on, and (host) skip once the timer is up. */
function Waiting({ view, act, pending, refresh }: ChaosScreenProps) {
  const { chaos, players, me, room } = view;
  const left = useSecondsLeft(chaos.step?.deadline);
  const names = chaos.waitingOn.map((id) => players.find((p) => p.id === id)?.nickname ?? "someone");
  return (
    <>
      <StepHeader chaos={chaos} refresh={refresh} />
      <section
        role="status"
        aria-live="polite"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <span aria-hidden className="text-6xl">
          ✅
        </span>
        <h1 className="font-heading text-3xl font-extrabold">Done!</h1>
        <p className="text-muted-foreground text-lg">
          {names.length > 0 ? `Waiting for ${names.join(", ")}…` : "Moving on…"}
        </p>
      </section>
      {me.isHost && names.length > 0 && (
        <Button
          variant="secondary"
          disabled={left > 0 || pending !== null}
          onClick={() =>
            act("skip", `/api/rooms/${room.id}/chaos/advance`, {
              stateVersion: chaos.stateVersion,
              action: "skip_waiting",
            })
          }
        >
          {left > 0 ? `Skip waiting in ${left}s` : "Skip waiting"}
        </Button>
      )}
    </>
  );
}
