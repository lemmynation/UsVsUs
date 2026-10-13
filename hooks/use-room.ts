"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, trackClient } from "@/lib/client-api";
import { isReaction, REACTION_EVENT, ROOM_CHANGED_EVENT, roomChannelName, type Reaction } from "@/lib/realtime/channel";
import type { RoomView } from "@/types/room";

export interface RealtimeConfig {
  url: string;
  publishableKey: string;
}

/** A reaction floating up the screen. */
export interface FloatingReaction {
  id: number;
  emoji: Reaction;
  /** Horizontal start, 0–100 (% of the screen). */
  left: number;
}

/** How long a reaction floats, and how many can be on screen at once. */
const REACTION_MS = 2600;
const MAX_FLOATING = 24;

/** Without realtime we poll quickly; with it, polling is just a heartbeat + safety net. */
const POLL_FAST_MS = 2_000;
const POLL_SLOW_MS = 10_000;

let browserClient: SupabaseClient | undefined;
export function getBrowserClient(config: RealtimeConfig) {
  browserClient ??= createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}

/**
 * Keeps a room view in sync. The server is the source of truth: realtime pings
 * only say "something changed", then we refetch. Also refetches when the tab
 * becomes visible again or the network comes back, so a phone that slept or
 * lost signal catches up on its own.
 *
 * With realtime connected, "Here / Away" comes from Supabase Presence (instant);
 * otherwise from the server's last-seen time.
 */
export function useRoom(initial: RoomView, realtime: RealtimeConfig | null) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [networkDown, setNetworkDown] = useState(false);
  const [presentIds, setPresentIds] = useState<Set<string> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const roomId = initial.room.id;

  // Live reactions: shown instantly for the sender, then echoed to everyone else by the server.
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const floatSeq = useRef(0);
  const sentNonces = useRef(new Set<string>());
  const showReaction = useCallback((emoji: Reaction) => {
    const id = ++floatSeq.current;
    const left = 8 + ((id * 37) % 84); // spread out, no two in a row on top of each other
    setFloating((f) => [...f.slice(-(MAX_FLOATING - 1)), { id, emoji, left }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), REACTION_MS);
  }, []);
  const sendReaction = useCallback(
    (emoji: Reaction) => {
      const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      // Echoes that never arrive (no realtime, dropped message) must not pile up.
      if (sentNonces.current.size > 100) sentNonces.current.clear();
      sentNonces.current.add(nonce);
      showReaction(emoji);
      // Fire and forget: a dropped reaction isn't worth an error message.
      apiFetch(`/api/rooms/${roomId}/react`, { method: "POST", body: { emoji, nonce } }).catch(() => {});
    },
    [roomId, showReaction],
  );
  const myId = initial.me.playerId;

  const refresh = useCallback(async () => {
    // A ping that arrives mid-fetch may describe a change the fetch started too
    // early to see — remember it and fetch once more instead of dropping it.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        try {
          setView(await apiFetch<RoomView>(`/api/rooms/${roomId}`));
          setError(null);
          setNetworkDown(false);
        } catch (err) {
          // Network blips keep the last good view; membership errors are terminal.
          if (err instanceof ApiError && err.code === "network") setNetworkDown(true);
          else if (err instanceof ApiError && err.code !== "rate_limited") setError(err.code);
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    if (!realtime) return;
    const supabase = getBrowserClient(realtime);
    const channel = supabase.channel(roomChannelName(roomId), { config: { presence: { key: myId } } });
    channel
      .on("broadcast", { event: ROOM_CHANGED_EVENT }, () => void refresh())
      .on("broadcast", { event: REACTION_EVENT }, ({ payload }) => {
        const { e, n } = (payload ?? {}) as { e?: unknown; n?: unknown };
        if (!isReaction(e)) return;
        if (typeof n === "string" && sentNonces.current.delete(n)) return; // our own, already shown
        showReaction(e);
      })
      .on("presence", { event: "sync" }, () => setPresentIds(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void channel.track({ at: Date.now() });
          void refresh(); // catch anything missed while connecting
        } else {
          setPresentIds(null); // fall back to server last-seen
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime, roomId, myId, refresh, showReaction]);

  useEffect(() => {
    if (error) return;
    const timer = setInterval(() => void refresh(), connected ? POLL_SLOW_MS : POLL_FAST_MS);
    return () => clearInterval(timer);
  }, [connected, error, refresh]);

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

  // Report a dropped connection once it's back, with how long it lasted (doc §14 health).
  const offlineSince = useRef<number | null>(null);
  useEffect(() => {
    if (networkDown) {
      offlineSince.current ??= Date.now();
    } else if (offlineSince.current !== null) {
      const seconds = Math.round((Date.now() - offlineSince.current) / 1000);
      offlineSince.current = null;
      trackClient("connection_restored", { seconds }, roomId);
    }
  }, [networkDown, roomId]);

  const players = presentIds
    ? view.players.map((p) => ({ ...p, isOnline: p.id === myId || presentIds.has(p.id) }))
    : view.players;

  return { view: { ...view, players }, error, refresh, reconnecting: networkDown, floating, sendReaction };
}
