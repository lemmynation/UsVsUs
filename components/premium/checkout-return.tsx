"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

// "dismissed": the host just cancelled, so don't ask "Already paid?" on this visit.
type Status = "idle" | "confirming" | "unlocked" | "not_confirmed" | "cancelled" | "dismissed";

/** Success and cancel notes fade once read; the pack card itself shows what's unlocked. */
const NOTE_MS = 6_000;

const POLL_MS = 2_000;
const MAX_TRIES = 15; // ~30s: wallets can take a moment to report back

/**
 * What the host sees around a checkout: confirming after returning from the
 * provider, "you weren't charged" after cancelling, and a "Check payment" button
 * when a checkout was started but never came back here (e.g. paid in the GCash app).
 */
export function CheckoutReturn({
  roomId,
  pendingCheckout,
  onUnlocked,
}: {
  roomId: string;
  pendingCheckout: boolean;
  onUnlocked: (packSlug: string) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>("idle");
  const running = useRef(false);

  const confirm = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("confirming");
    try {
      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const { unlocked } = await apiFetch<{ unlocked: string[] }>(`/api/rooms/${roomId}/payments/confirm`, {
            method: "POST",
            body: {},
          });
          if (unlocked.length > 0) {
            setStatus("unlocked");
            onUnlocked(unlocked.at(-1)!);
            return;
          }
        } catch {
          // Network blip: keep trying until the time runs out.
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      setStatus("not_confirmed");
    } finally {
      running.current = false;
    }
  }, [roomId, onUnlocked]);

  // React to ?checkout=… once, then tidy the address bar so a refresh doesn't replay it.
  const handled = useRef(false);
  useEffect(() => {
    const result = params.get("checkout");
    if (!result || handled.current) return;
    handled.current = true;
    router.replace(`/room/${roomId}`, { scroll: false });
    if (result === "success") void confirm();
    else queueMicrotask(() => setStatus("cancelled"));
  }, [params, roomId, router, confirm]);

  useEffect(() => {
    if (status !== "unlocked" && status !== "cancelled") return;
    const timer = setTimeout(() => setStatus(status === "cancelled" ? "dismissed" : "idle"), NOTE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <div aria-live="polite">
      {status === "confirming" && (
        <p className="bg-card rounded-2xl p-4 text-center text-lg">⏳ Confirming your payment…</p>
      )}
      {status === "unlocked" && (
        <p className="border-mode-gradient rounded-2xl p-4 text-center text-lg font-semibold">
          🎉 Unlocked for everyone in this room!
        </p>
      )}
      {status === "cancelled" && (
        <p className="bg-card rounded-2xl p-4 text-center text-lg">Payment cancelled — you weren&apos;t charged.</p>
      )}
      {(status === "not_confirmed" || (status === "idle" && pendingCheckout)) && (
        <div className="bg-card flex flex-col gap-2 rounded-2xl p-4 text-center">
          <p className="text-lg">
            {status === "not_confirmed"
              ? "We haven't received the payment yet. If you paid, it can take a minute."
              : "Already paid in GCash, Maya or your bank app?"}
          </p>
          <Button variant="secondary" onClick={() => void confirm()}>
            Check payment
          </Button>
        </div>
      )}
    </div>
  );
}
