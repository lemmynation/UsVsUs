"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client-api";
import { ROOM_CHANGED_EVENT, roomChannelName } from "@/lib/realtime/channel";
import type { RoomView } from "@/types/room";

export interface RealtimeConfig {
  url: string;
  publishableKey: string;
}

/** Without realtime we poll quickly; with it, polling is just a heartbeat + safety net. */
const POLL_FAST_MS = 2_000;
const POLL_SLOW_MS = 10_000;

let browserClient: SupabaseClient | undefined;
function getBrowserClient(config: RealtimeConfig) {
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
  }, [realtime, roomId, myId, refresh]);

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

  const players = presentIds
    ? view.players.map((p) => ({ ...p, isOnline: p.id === myId || presentIds.has(p.id) }))
    : view.players;

  return { view: { ...view, players }, error, refresh, reconnecting: networkDown };
}
