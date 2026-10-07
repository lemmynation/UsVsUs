import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LoadingCard } from "@/components/layout/loading-card";
import { PageShell } from "@/components/layout/page-shell";
import { JoinRoomForm } from "@/components/room/join-room-form";
import { StatusCard } from "@/components/room/status-card";
import { MODE_META } from "@/lib/modes";
import { errorMessage } from "@/lib/rooms/errors";
import { getRoomService } from "@/lib/rooms/server";
import { readSessionHash } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "You're invited — Us vs. Us" };

const UNAVAILABLE_COPY: Record<string, { emoji: string; title: string }> = {
  invalid_code: { emoji: "🔤", title: "That code looks off" },
  room_not_found: { emoji: "🔍", title: "Room not found" },
  room_expired: { emoji: "⌛", title: "Room expired" },
  room_closed: { emoji: "🚪", title: "Room closed" },
  room_in_progress: { emoji: "🎬", title: "Game already started" },
  room_full: { emoji: "🪑", title: "Room is full" },
  kicked: { emoji: "👋", title: "You were removed" },
};

export default function JoinRoomPage(props: PageProps<"/join/[code]">) {
  return (
    <PageShell>
      <Wordmark />
      <Suspense fallback={<LoadingCard label="Finding room…" />}>
        <JoinContent params={props.params} />
      </Suspense>
    </PageShell>
  );
}

async function JoinContent({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  await connection(); // depends on the visitor's cookie and the current time
  const { code } = await params;
  const info = await getRoomService().getJoinInfo(code, await readSessionHash());

  if (info.kind === "member") redirect(`/room/${info.roomId}`);

  if (info.kind === "unavailable") {
    const copy = UNAVAILABLE_COPY[info.error] ?? { emoji: "🤔", title: "Can't join" };
    return <StatusCard emoji={copy.emoji} title={copy.title} message={errorMessage(info.error)} />;
  }

  const { preview } = info;
  const meta = MODE_META[preview.mode];
  return (
    <div className={cn(meta.className, "flex flex-col gap-6")}>
      <section className="border-mode-gradient flex flex-col gap-1 rounded-3xl p-5">
        <p className="text-muted-foreground text-base">You&apos;re invited to</p>
        <h1 className="font-heading text-3xl font-extrabold break-words">{preview.name ?? `${meta.label} game`}</h1>
        <p className="text-muted-foreground text-base">
          {meta.emoji} {meta.label} · {preview.playerCount}/{preview.maxPlayers} players · code{" "}
          <span className="text-foreground font-mono font-semibold">{preview.joinCode}</span>
        </p>
      </section>
      <JoinRoomForm code={preview.joinCode} />
    </div>
  );
}
