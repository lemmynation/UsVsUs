"use client";

import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, trackClient } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { PremiumView } from "@/types/premium";

/**
 * S05 + S12: the host picks the free game or a pack; a locked pack shows its
 * perks and price and opens the provider's checkout. Unlocking is per room.
 */
export function PackPicker({
  roomId,
  premium,
  selected,
  onSelect,
}: {
  roomId: string;
  premium: PremiumView;
  selected: string | null;
  onSelect: (packSlug: string | null) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedSlugs = premium.packs
    .filter((p) => !p.unlocked)
    .map((p) => p.slug)
    .join(",");

  useEffect(() => {
    if (lockedSlugs) trackClient("premium_pack_viewed", { packs: lockedSlugs }, roomId);
  }, [lockedSlugs, roomId]);

  // Backing out of the provider's checkout can restore this page from the browser's
  // back-forward cache exactly as it was left: clear the "opening checkout" state.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setOpening(null);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function unlock(packSlug: string) {
    setOpening(packSlug);
    setError(null);
    try {
      const { checkoutUrl } = await apiFetch<{ checkoutUrl: string }>(`/api/rooms/${roomId}/checkout`, {
        method: "POST",
        body: { packSlug },
      });
      window.location.assign(checkoutUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open checkout. Please try again.");
      setOpening(null);
    }
  }

  return (
    <section aria-labelledby="packs-heading" className="flex flex-col gap-3">
      <h2 id="packs-heading" className="text-lg font-semibold">
        Choose your game
      </h2>
      <div role="radiogroup" aria-labelledby="packs-heading" className="flex flex-col gap-2">
        <Option checked={selected === null} onSelect={() => onSelect(null)}>
          <span className="text-lg font-bold">🎲 Free game</span>
          <span className="text-muted-foreground text-base">3 rounds · about 10 minutes</span>
        </Option>

        {premium.packs.map((pack) =>
          pack.unlocked ? (
            <Option key={pack.slug} checked={selected === pack.slug} onSelect={() => onSelect(pack.slug)}>
              <span className="flex items-center gap-2 text-lg font-bold">
                {pack.emoji} {pack.name}
                <span className="bg-mode-gradient rounded-full px-2 py-0.5 text-xs font-bold text-[oklch(0.18_0.04_300)]">
                  Unlocked
                </span>
              </span>
              <span className="text-muted-foreground text-base">{pack.tagline}</span>
            </Option>
          ) : (
            <div key={pack.slug} className="border-mode-gradient flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-lg font-bold">
                    {pack.emoji} {pack.name}
                    <Lock aria-label="Locked" className="text-muted-foreground size-4" />
                  </span>
                  <span className="text-muted-foreground text-base">{pack.tagline}</span>
                </div>
                <span className="shrink-0 text-xl font-extrabold">{pack.price}</span>
              </div>
              <ul className="flex flex-col gap-1 text-base">
                {pack.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <Check aria-hidden className="size-4 shrink-0 text-emerald-400" /> {perk}
                  </li>
                ))}
              </ul>
              {/* Outlined: "Start game" stays the one main action on the screen. */}
              <Button variant="outline" onClick={() => unlock(pack.slug)} disabled={opening !== null}>
                {opening === pack.slug ? "Opening checkout…" : `Unlock for ${pack.price}`}
              </Button>
              <p className="text-muted-foreground text-sm">
                One payment unlocks it for everyone in this room. GCash, Maya, card or QR Ph.
              </p>
            </div>
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
    </section>
  );
}

function Option({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
        "focus-visible:ring-ring/60 focus-visible:ring-3 focus-visible:outline-none",
        checked ? "border-mode-gradient" : "bg-card border-transparent",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-primary bg-primary" : "border-muted-foreground/60",
        )}
      >
        {checked && <Check className="text-primary-foreground size-4" />}
      </span>
      <span className="flex min-w-0 flex-col">{children}</span>
    </button>
  );
}
