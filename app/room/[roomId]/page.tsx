import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { Wordmark } from "@/components/brand/wordmark";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { Lobby } from "@/components/room/lobby";
import { StatusCard } from "@/components/room/status-card";
import { getPublicRealtimeConfig } from "@/lib/env";
import { errorMessage } from "@/lib/rooms/errors";
import { getRoomService, getRoomStore } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";

export const metadata = { title: "Lobby — Us vs. Us" };

export default function RoomPage(props: PageProps<"/room/[roomId]">) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingCard label="Opening room…" />}>
        <RoomContent params={props.params} />
      </Suspense>
    </PageShell>
  );
}

async function RoomContent({ params }: { params: PageProps<"/room/[roomId]">["params"] }) {
  await connection(); // per-visitor, time-dependent state: never prerender
  const { roomId } = await params;
  if (!z.uuid().safeParse(roomId).success) return <NotFound />;

  const result = await getRoomService().getRoomView(roomId, await readSessionHash());
  if (!result.ok) {
    if (result.error === "not_in_room") {
      // Someone opened a room URL directly — send them through the join flow.
      const room = await getRoomStore().getRoomById(roomId);
      if (room) redirect(`/join/${room.joinCode}`);
    }
    if (result.error === "kicked") {
      return (
        <>
          <Wordmark />
          <StatusCard emoji="👋" title="You were removed" message={errorMessage("kicked")} />
        </>
      );
    }
    return <NotFound />;
  }

  return <Lobby initialView={result.value} realtime={getPublicRealtimeConfig()} />;
}

function NotFound() {
  return (
    <>
      <Wordmark />
      <StatusCard
        emoji="🔍"
        title="Room not found"
        message={errorMessage("room_not_found")}
        action={{ href: "/join", label: "Try another code" }}
        secondary={{ href: "/", label: "Start your own game" }}
      />
    </>
  );
}
