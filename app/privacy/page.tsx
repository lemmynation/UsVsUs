import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { PageShell } from "@/components/layout/page-shell";
import { RETENTION_DAYS } from "@/lib/retention";

export const metadata: Metadata = {
  title: "Privacy — Us vs. Us",
  description: "What Us vs. Us keeps, why, and for how long.",
};

/** Plain-language privacy notice (design doc §15). Periods come from lib/retention.ts. */
export default function PrivacyPage() {
  return (
    <PageShell>
      <Wordmark className="self-start" />
      <article className="flex flex-col gap-6 text-base leading-relaxed">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-extrabold">Privacy</h1>
          <p className="text-muted-foreground">
            Short version: no accounts, no real names needed, and game data is deleted after a while.
          </p>
        </header>

        <Section title="What we keep">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>The nickname you type</strong> and the room you join. A nickname doesn&apos;t have to be your real
              name.
            </li>
            <li>
              <strong>Your answers and scores</strong>, so the game can reveal them and build the Wrapped recap. Other
              players only see answers after each reveal.
            </li>
            <li>
              <strong>A random cookie</strong> that keeps you in your room if you refresh. We store only a scrambled
              (hashed) version of it, never anything that identifies you.
            </li>
            <li>
              <strong>Which questions your browser has seen</strong>, so your group doesn&apos;t get repeats.
            </li>
            <li>
              <strong>Anonymous usage events</strong> like &quot;a room was created&quot; or &quot;a game
              finished&quot;, plus error reports with personal details stripped out. These never include nicknames or
              answers.
            </li>
            <li>
              <strong>Feedback you choose to give</strong> after a game: a rating and, if you write one, a comment. We
              read it without names, and it&apos;s unlinked from your room when the room is deleted.
            </li>
            <li>
              <strong>A short-lived request count</strong> per network address, to stop spam. The address is stored
              scrambled and the count is cleared within minutes to a day.
            </li>
          </ul>
        </Section>

        <Section title="Payments">
          <p>
            Premium packs are paid through PayMongo on their own checkout page. Card and e-wallet details go to them,
            never to us. We keep a record of the purchase (amount, pack, date) for refunds and accounting.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Rooms, nicknames, answers, scores and Wrapped recaps: deleted {RETENTION_DAYS.rooms} days after the room
              expires. Rooms expire within a day of being made.
            </li>
            <li>Question history: {RETENTION_DAYS.questionHistory} days.</li>
            <li>
              Anonymous usage events, error reports and feedback: about {Math.round(RETENTION_DAYS.events / 30)} months.
            </li>
            <li>Purchase records: kept, without any link to the room or its players.</li>
          </ul>
        </Section>

        <Section title="What we don't do">
          <p>No ads, no selling data, no tracking you across other sites. Shared Wrapped cards show nicknames only.</p>
        </Section>

        <Link
          href="/"
          className="text-primary inline-flex min-h-11 items-center self-start font-medium underline underline-offset-4"
        >
          Back to the game
        </Link>
      </article>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
