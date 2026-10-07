"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/client-api";

const noSubscribe = () => () => {};

/** Browser-only values; the server render uses the fallbacks. */
function useBrowserValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscribe, read, () => serverValue);
}

export function InvitePanel({ roomId, joinCode }: { roomId: string; joinCode: string }) {
  const origin = useBrowserValue(() => window.location.origin, "");
  const canShare = useBrowserValue(() => typeof navigator.share === "function", false);
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${origin}/join/${joinCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackClient("invite_shared", { method: "copy" }, roomId);
    } catch {
      window.prompt("Copy this invite link:", inviteUrl);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Us vs. Us",
        text: `Join my Us vs. Us room — code ${joinCode}`,
        url: inviteUrl,
      });
      trackClient("invite_shared", { method: "native" }, roomId);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // user closed the sheet
      await copy();
    }
  }

  return (
    <section aria-labelledby="invite-heading" className="border-mode-gradient flex flex-col gap-4 rounded-3xl p-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 id="invite-heading" className="text-muted-foreground text-base">
          Room code
        </h2>
        <p className="font-mono text-5xl font-bold tracking-[0.2em]" data-testid="join-code">
          {joinCode}
        </p>
      </div>
      <div className="flex gap-3">
        {canShare && (
          <Button className="flex-1" onClick={share}>
            <Share2 aria-hidden /> Share invite
          </Button>
        )}
        <Button className="flex-1" variant={canShare ? "secondary" : "default"} onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? "Invite link copied" : ""}
      </p>
    </section>
  );
}
