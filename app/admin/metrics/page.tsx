import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FeedbackView, MetricsView } from "@/components/admin/metrics-view";
import { Wordmark } from "@/components/brand/wordmark";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminToken, isAdmin } from "@/lib/admin";
import { computeMetrics, summarizeFeedback } from "@/lib/analytics/metrics";
import { RETENTION_DAYS } from "@/lib/retention";
import { getRoomStore } from "@/lib/rooms/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Metrics — Us vs. Us",
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Enough for a beta; the page says so if a window holds more. */
const MAX_EVENTS = 100_000;
const WINDOWS = [7, 30] as const;

export default function MetricsPage(props: PageProps<"/admin/metrics">) {
  return (
    <PageShell className="max-w-2xl">
      <Suspense fallback={<LoadingCard label="Crunching numbers…" />}>
        <MetricsContent searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function MetricsContent({ searchParams }: { searchParams: PageProps<"/admin/metrics">["searchParams"] }) {
  await connection();
  if (!adminToken()) notFound();
  const query = await searchParams;
  const param = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);

  if (!(await isAdmin())) return <LoginForm error={param("login")} />;

  const days = param("days") === "30" ? 30 : 7;
  const now = new Date();
  const from = new Date(now.getTime() - days * DAY_MS);
  // A day of lead-in so games that finished inside the window still find their players.
  const store = getRoomStore();
  const [events, feedback] = await Promise.all([
    store.listEvents(new Date(from.getTime() - DAY_MS).toISOString(), MAX_EVENTS),
    store.listFeedback(from.toISOString(), 1000),
  ]);
  const metrics = computeMetrics(events, { from, now });

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Wordmark />
          <h1 className="font-heading text-2xl font-extrabold">Metrics</h1>
        </div>
        <form action="/api/admin/logout" method="post">
          <Button type="submit" variant="ghost">
            Log out
          </Button>
        </form>
      </header>

      <nav aria-label="Time period" className="bg-muted flex gap-1 self-start rounded-xl p-1">
        {WINDOWS.map((d) => (
          <Link
            key={d}
            href={`/admin/metrics?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={cn(
              "flex h-11 items-center rounded-lg px-4 text-sm font-medium",
              d === days ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            Last {d} days
          </Link>
        ))}
      </nav>

      {events.length >= MAX_EVENTS && (
        <p role="status" className="text-destructive text-sm">
          Showing the first {MAX_EVENTS.toLocaleString()} events only — numbers for this period are incomplete.
        </p>
      )}

      <MetricsView metrics={metrics} />

      <FeedbackView feedback={summarizeFeedback(feedback)} />

      <CleanupPanel query={param} />
    </>
  );
}

function LoginForm({ error }: { error?: string }) {
  const message =
    error === "wrong" ? "That token isn't right." : error === "slow" ? "Too many tries. Wait 15 minutes." : null;
  return (
    <>
      <Wordmark />
      <form action="/api/admin/login" method="post" className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-extrabold">Metrics</h1>
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-token">Admin token</Label>
          <Input
            id="admin-token"
            name="token"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "admin-token-error" : undefined}
          />
          {message && (
            <p id="admin-token-error" role="alert" className="text-destructive text-sm">
              {message}
            </p>
          )}
        </div>
        <Button type="submit" size="lg">
          Log in
        </Button>
      </form>
    </>
  );
}

function CleanupPanel({ query }: { query: (key: string) => string | undefined }) {
  const cleaned = query("cleaned") === "1";
  const n = (key: string) => Number(query(key) ?? 0) || 0;
  return (
    <section aria-labelledby="cleanup-heading" className="bg-card flex flex-col gap-3 rounded-xl p-4">
      <h2 id="cleanup-heading" className="font-heading text-xl font-bold">
        Data cleanup
      </h2>
      <p className="text-muted-foreground text-sm">
        Deletes rooms (with their players, answers and results) {RETENTION_DAYS.rooms} days after they expire, question
        history after {RETENTION_DAYS.questionHistory} days, and usage events and feedback after {RETENTION_DAYS.events}{" "}
        days. Paid payment records are kept. Runs automatically every day once deployed.
      </p>
      {cleaned && (
        <p role="status" className="text-sm">
          Done: removed {n("rooms")} rooms, {n("questionHistory")} history rows, {n("events")} events, {n("feedback")}{" "}
          feedback entries and {n("paymentEvents")} webhook ids.
        </p>
      )}
      <form action="/api/admin/cleanup" method="post">
        <Button type="submit" variant="secondary">
          Run cleanup now
        </Button>
      </form>
    </section>
  );
}
