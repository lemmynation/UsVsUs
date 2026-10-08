"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
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
  // The card is fetched ahead of time: Safari only opens the share sheet straight
  // from a tap, and waiting on a download first uses up that permission.
  const [card, setCard] = useState<File | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canShareFiles) return;
    let cancelled = false;
    fetch(imageUrl)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`image ${res.status}`))))
      .then((blob) => !cancelled && setCard(new File([blob], FILE_NAME, { type: "image/png" })))
      .catch(() => !cancelled && setCard("failed")); // "Save image" still works
    return () => {
      cancelled = true;
    };
  }, [canShareFiles, imageUrl]);

  async function share() {
    if (!(card instanceof File)) return;
    setError(null);
    try {
      await navigator.share({ files: [card], title: "Our Us vs. Us Wrapped" });
      trackClient("wrapped_shared", { method: "share" }, roomId);
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Couldn't share the image. Try saving it instead.");
      }
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-3">
      {canShareFiles && card !== "failed" && (
        <Button size="lg" className="w-full" onClick={share} disabled={card === null}>
          {card === null ? "Preparing your card…" : "Share results"}
        </Button>
      )}
      <a
        href={imageUrl}
        download={FILE_NAME}
        onClick={() => trackClient("wrapped_shared", { method: "download" }, roomId)}
        className={cn(
          buttonVariants({ size: "lg", variant: canShareFiles && card !== "failed" ? "secondary" : "default" }),
          "w-full",
        )}
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
