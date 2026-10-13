import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { PartyScreen } from "@/components/party/party-screen";
import { StatusCard } from "@/components/room/status-card";
import { getPublicRealtimeConfig, partyScreenEnabled } from "@/lib/env";

export const metadata = { title: "Party Screen — Us vs. Us", robots: { index: false } };

/** Open on a TV or laptop: shows a code to pair with a Mutation Machine room, then the game. */
export default function PartyPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <LoadingCard label="Getting the screen ready…" />
        </PageShell>
      }
    >
      <PartyContent />
    </Suspense>
  );
}

async function PartyContent() {
  await connection(); // the feature flag and realtime settings are read per request
  if (!partyScreenEnabled()) {
    return (
      <PageShell>
        <Wordmark />
        <StatusCard
          emoji="📺"
          title="Party Screen is coming soon"
          message="Play on your phones for now."
          action={{ href: "/", label: "Back to the games" }}
        />
      </PageShell>
    );
  }
  return <PartyScreen realtime={getPublicRealtimeConfig()} />;
}
