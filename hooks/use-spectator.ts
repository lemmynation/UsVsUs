"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client-api";
import { isReaction, REACTION_EVENT, ROOM_CHANGED_EVENT, roomChannelName, type Reaction } from "@/lib/realtime/channel";
import type { SpectatorState, SpectatorView } from "@/types/party";
import { getBrowserClient, type FloatingReaction, type RealtimeConfig } from "./use-room";

export type TvState =
  | { kind: "loading" }
  | { kind: "pairing"; code: string; expiresAt: string; revoked: boolean }
  | { kind: "paired"; view: SpectatorView }
  | { kind: "ended" }
  /** Couldn't get a code (e.g. rate limited); tries again on its own. */
  | { kind: "error" };

const POLL_FAST_MS = 2_000;
const POLL_SLOW_MS = 10_000;
const RETRY_MS = 30_000;
const REACTION_MS = 2600;
const MAX_FLOATING = 24;

/**
 * Keeps the Party Screen in sync, like `useRoom` for phones: the server says what to
 * show, realtime pings (and a poll) say when to look again. Unpaired, it shows a code
 * and asks for a fresh one when that expires or the host disconnects this TV.
 */
export function useSpectator(realtime: RealtimeConfig | null) {
  const [state, setState] = useState<TvState>({ kind: "loading" });
  const [networkDown, setNetworkDown] = useState(false);
  const [connected, setConnected] = useState(false);
  const pairing = useRef<{ code: string; expiresAt: string } | null>(null);
  const requesting = useRef(false);
  const inFlight = useRef(false);
  const again = useRef(false);

  const newCode = useCallback(async (revoked: boolean) => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      const r = await apiFetch<{ code: string; expiresAt: string }>("/api/party", { method: "POST" });
      pairing.current = r;
      setState({ kind: "pairing", ...r, revoked });
      setNetworkDown(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "network") setNetworkDown(true);
      else setState({ kind: "error" });
    } finally {
      requesting.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        let s: SpectatorState;
        try {
          s = await apiFetch<SpectatorState>("/api/party/me");
          setNetworkDown(false);
        } catch (err) {
          if (err instanceof ApiError && err.code === "network") setNetworkDown(true);
          continue; // keep showing what we have; the next poll tries again
        }
        if (s.status === "paired") {
          pairing.current = null;
          setState({ kind: "paired", view: s.view });
        } else if (s.status === "ended") {
          pairing.current = null;
          setState({ kind: "ended" });
        } else if (s.status === "pending" && pairing.current && new Date(pairing.current.expiresAt) > new Date()) {
          // Still waiting for the host to type the code on screen.
        } else {
          // No code on screen (first load, reload), it expired, or the host disconnected us.
          await newCode(s.status === "unpaired" && s.reason === "revoked");
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [newCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll: quick while pairing or without realtime, a slow heartbeat with it. A finished
  // room needs nothing; a failed code request tries again after a while.
  const kind = state.kind;
  useEffect(() => {
    if (kind === "ended" || kind === "loading") return;
    const ms = kind === "error" ? RETRY_MS : kind === "paired" && connected ? POLL_SLOW_MS : POLL_FAST_MS;
    const timer = setInterval(() => void (kind === "error" ? newCode(false) : refresh()), ms);
    return () => clearInterval(timer);
  }, [kind, connected, refresh, newCode]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    const onOffline = () => setNetworkDown(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  // Reactions from the room's phones float up the big screen too.
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const floatSeq = useRef(0);
  const showReaction = useCallback((emoji: Reaction) => {
    const id = ++floatSeq.current;
    const left = 8 + ((id * 37) % 84);
    setFloating((f) => [...f.slice(-(MAX_FLOATING - 1)), { id, emoji, left }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), REACTION_MS);
  }, []);

  // Same payload-free room channel as the phones. The TV listens only: it never joins presence.
  const roomId = state.kind === "paired" ? state.view.room.id : null;
  useEffect(() => {
    if (!realtime || !roomId) return;
    const supabase = getBrowserClient(realtime);
    const channel = supabase.channel(roomChannelName(roomId));
    channel
      .on("broadcast", { event: ROOM_CHANGED_EVENT }, () => void refresh())
      .on("broadcast", { event: REACTION_EVENT }, ({ payload }) => {
        const e = (payload as { e?: unknown } | undefined)?.e;
        if (isReaction(e)) showReaction(e);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [realtime, roomId, refresh, showReaction]);

  return { state, reconnecting: networkDown, floating, newCode: () => newCode(false) };
}
