import type { FeedbackSummary, Metrics, Rate } from "@/lib/analytics/metrics";
import { cn } from "@/lib/utils";

const pct = (r: Rate) => (r.value === null ? "—" : `${Math.round(r.value * 100)}%`);
const ofTotal = (r: Rate) => (r.denominator === 0 ? "no data yet" : `${r.numerator} of ${r.denominator}`);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", // the server runs in UTC
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** The §14 dashboard: decision metrics, funnel, technical health, recent errors. */
export function MetricsView({ metrics }: { metrics: Metrics }) {
  const { decision, funnel, health } = metrics;
  const top = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="flex flex-col gap-8">
      <Section title="Decision metrics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Room activation"
            hint="Created rooms that started a game"
            value={pct(decision.roomActivation)}
            detail={ofTotal(decision.roomActivation)}
          />
          <Stat
            label="Completion"
            hint="Started games that reached Wrapped"
            value={pct(decision.completion)}
            detail={ofTotal(decision.completion)}
          />
          <Stat
            label="Invite efficiency"
            hint="Guests joined per created room"
            value={decision.invitesPerRoom === null ? "—" : decision.invitesPerRoom.toFixed(1)}
            detail="guests per room"
          />
          <Stat
            label="Share rate"
            hint="Finished rooms that shared results"
            value={pct(decision.shareRate)}
            detail={ofTotal(decision.shareRate)}
          />
          <Stat
            label="Replay (7 days)"
            hint="Players who started their own room within a week"
            value={pct(decision.replay7d)}
            detail={ofTotal(decision.replay7d)}
          />
          <Stat
            label="Paid conversion"
            hint="Rooms that saw the premium pack and bought it"
            value={pct(decision.paidConversion)}
            detail={ofTotal(decision.paidConversion)}
          />
        </div>
      </Section>

      <Section title="Funnel">
        <ol className="flex flex-col gap-2">
          {funnel.map((f) => (
            <li key={f.step} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{f.label}</span>
                <span className="font-semibold tabular-nums">{f.count}</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                <div className="bg-primary h-full rounded-full" style={{ width: `${(f.count / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-xs">
          Visits and mode picks count browsers (a first-time visit counts once per page view); the rest count rooms.
        </p>
      </Section>

      <Section title="Technical health">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Failed joins"
            value={pct(health.joinFailureRate)}
            detail={ofTotal(health.joinFailureRate)}
            warn={(health.joinFailureRate.value ?? 0) > 0.1}
          />
          <Stat
            label="Reconnects"
            value={String(health.reconnects.count)}
            detail={
              health.reconnects.medianSeconds === null ? "none" : `median ${health.reconnects.medianSeconds}s offline`
            }
          />
          <Stat label="Payment failures" value={String(health.paymentFailures)} warn={health.paymentFailures > 0} />
          <Stat
            label="Errors"
            value={String(health.serverErrors + health.clientErrors)}
            detail={`${health.serverErrors} server · ${health.clientErrors} phone`}
            warn={health.serverErrors + health.clientErrors > 0}
          />
        </div>

        {health.joinFailuresByReason.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Join problems:{" "}
            {health.joinFailuresByReason.map((r) => `${r.reason.replaceAll("_", " ")} (${r.count})`).join(", ")}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-muted-foreground mb-2 text-left text-xs">
              Server time per request, slowest first
            </caption>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th scope="col" className="py-1 font-medium">
                  Route
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Calls
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  p50
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  p95
                </th>
              </tr>
            </thead>
            <tbody>
              {health.latency.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground py-2">
                    No timings yet.
                  </td>
                </tr>
              )}
              {health.latency.map((l) => (
                <tr key={l.route} className="border-border border-t">
                  <td className="py-1.5">{l.route.replaceAll("_", " ")}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{Math.round(l.p50)} ms</td>
                  <td
                    className={cn("py-1.5 text-right tabular-nums", l.p95 > 1000 && "text-destructive font-semibold")}
                  >
                    {Math.round(l.p95)} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent errors">
        {health.recentErrors.length === 0 ? (
          <p className="text-muted-foreground text-sm">No errors in this period. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.recentErrors.map((e) => (
              <li key={`${e.source}|${e.message}|${e.path}`} className="bg-card rounded-xl p-3 text-sm">
                <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
                  <span>
                    {e.source === "server" ? "Server" : "Phone"} · {e.path || "unknown page"}
                  </span>
                  <span>
                    {e.count}× · last {when(e.lastSeen)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs break-words">{e.message || "(no message)"}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h2 id={id} className="font-heading text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
  hint,
  warn = false,
}: {
  label: string;
  value: string;
  detail?: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-card flex flex-col gap-0.5 rounded-xl p-3">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs leading-snug">{hint}</span>}
      <span className={cn("font-heading text-2xl font-extrabold tabular-nums", warn && "text-destructive")}>
        {value}
      </span>
      {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
    </div>
  );
}

const RATING_LABELS: Record<number, string> = {
  4: "😍 Loved it",
  3: "🙂 Liked it",
  2: "😐 It was okay",
  1: "😕 Not for us",
};

/** Beta feedback players left after Wrapped. */
export function FeedbackView({ feedback }: { feedback: FeedbackSummary }) {
  const top = Math.max(1, ...feedback.byRating.map((r) => r.count));
  return (
    <Section title="Player feedback">
      {feedback.count === 0 ? (
        <p className="text-muted-foreground text-sm">No ratings in this period yet.</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-heading text-2xl font-extrabold tabular-nums">{feedback.average!.toFixed(1)}</span>
            <span className="text-muted-foreground"> / 4 average from {feedback.count} ratings</span>
          </p>
          <ul className="flex flex-col gap-2">
            {feedback.byRating.map((r) => (
              <li key={r.rating} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span>{RATING_LABELS[r.rating]}</span>
                  <span className="font-semibold tabular-nums">{r.count}</span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(r.count / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {feedback.recentComments.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Latest comments">
              {feedback.recentComments.map((c) => (
                <li key={`${c.createdAt}|${c.comment}`} className="bg-card rounded-xl p-3 text-sm">
                  <div className="text-muted-foreground flex justify-between gap-3 text-xs">
                    <span>
                      {RATING_LABELS[c.rating]} · {c.mode}
                    </span>
                    <span>{when(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 break-words whitespace-pre-line">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
