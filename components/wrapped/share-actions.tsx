"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { trackClient } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { Mode } from "@/types/room";

const FILE_NAME = "us-vs-us-wrapped.png";

const noSubscribe = () => () => {};
let shareSupport: boolean | undefined;
function browserCanShareFiles(): boolean {
  shareSupport ??=
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([""], FILE_NAME, { type: "image/png" })] });
  return shareSupport;
}

/**
 * Share the 1080×1920 card through the phone's share sheet when it can take
 * files; otherwise (most desktops) save it. Play again starts a fresh room.
 */
export function ShareActions({ roomId, mode }: { roomId: string; mode: Mode }) {
  const imageUrl = `/api/rooms/${roomId}/wrapped/image`;
  // The server render can't know what the browser supports, so it starts as "save only".
  const canShareFiles = useSyncExternalStore(noSubscribe, browserCanShareFiles, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(imageUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`image ${res.status}`);
      const file = new File([await res.blob()], FILE_NAME, { type: "image/png" });
      await navigator.share({ files: [file], title: "Our Us vs. Us Wrapped" });
      trackClient("wrapped_shared", { method: "share" }, roomId);
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Couldn't share the image. Try saving it instead.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-3">
      {canShareFiles && (
        <Button size="lg" className="w-full" onClick={share} disabled={busy}>
          {busy ? "Making your card…" : "Share results"}
        </Button>
      )}
      <a
        href={imageUrl}
        download={FILE_NAME}
        onClick={() => trackClient("wrapped_shared", { method: "download" }, roomId)}
        className={cn(buttonVariants({ size: "lg", variant: canShareFiles ? "secondary" : "default" }), "w-full")}
      >
        Save image
      </a>
      {error && (
        <p role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
      <Link
        href={`/create?mode=${mode}`}
        onClick={() => trackClient("play_again_clicked", { mode }, roomId)}
        className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
      >
        Play again
      </Link>
    </div>
  );
}
