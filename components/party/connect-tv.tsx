"use client";

import { Tv } from "lucide-react";
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/client-api";
import { errorMessage } from "@/lib/rooms/errors";
import type { DisplaySummary } from "@/types/party";

const noSubscribe = () => () => {};

const STATUS_LABEL: Record<DisplaySummary["status"], string> = {
  showing: "showing the game",
  connecting: "connecting…",
  away: "not seen lately",
};

/**
 * Host only, in the Mutation Machine lobby: pair a TV or laptop as the Party Screen by
 * typing the code it shows, and disconnect TVs (docs/usvsus-4/07).
 */
export function ConnectTv({ roomId }: { roomId: string }) {
  const host = useSyncExternalStore(
    noSubscribe,
    () => window.location.host,
    () => "",
  );
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [displays, setDisplays] = useState<DisplaySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiFetch<{ displays: DisplaySummary[] }>(`/api/rooms/${roomId}/displays`)
        .then((r) => setDisplays(r.displays))
        // The list is a nicety; pairing still works without it.
        .catch(() => {}),
    [roomId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A freshly paired TV takes a moment to load: keep its status current while it matters.
  const watching = open || displays.length > 0;
  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [watching, load]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/rooms/${roomId}/displays`, { method: "POST", body: { code } });
      setCode("");
      setNotice("Connected! The TV shows the lobby now.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage("unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(display: DisplaySummary) {
    if (!window.confirm(`Disconnect ${display.label}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/rooms/${roomId}/displays/${display.id}`, { method: "DELETE" });
      setNotice(`${display.label} disconnected.`);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "display_not_found")) {
        setError(err instanceof ApiError ? err.message : errorMessage("unknown"));
      }
    }
    await load();
  }

  return (
    <section aria-labelledby="tv-heading" className="bg-card flex flex-col gap-3 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tv-heading" className="text-lg font-semibold">
          📺 Party Screen
        </h2>
        {!open && (
          <Button variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>
            <Tv aria-hidden /> Connect a TV
          </Button>
        )}
      </div>

      {displays.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Connected TVs">
          {displays.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3">
              <span className="text-base">
                {d.label} · <span className="text-muted-foreground">{STATUS_LABEL[d.status]}</span>
              </span>
              <Button variant="ghost" onClick={() => disconnect(d)} aria-label={`Disconnect ${d.label}`}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={connect} className="flex flex-col gap-3">
          <p className="text-base">
            On the TV or laptop, open <strong className="break-all">{host ? `${host}/party` : "/party"}</strong>. Then
            type the code it shows:
          </p>
          <Label htmlFor={inputId}>TV code</Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={7}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="font-mono tracking-[0.2em] uppercase"
              aria-describedby={error ? `${inputId}-error` : undefined}
              aria-invalid={error ? true : undefined}
            />
            <Button type="submit" disabled={busy || code.replace(/[\s-]/g, "").length !== 6}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </form>
      ) : (
        displays.length === 0 && (
          <p className="text-muted-foreground text-base">
            Show the game on a big screen: the reveal plays there, phones stay private.
          </p>
        )
      )}

      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-destructive text-base">
          {error}
        </p>
      )}
      <p className="text-base" role="status">
        {notice}
      </p>
    </section>
  );
}
