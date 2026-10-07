"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client-api";
import { ROOM_CHANGED_EVENT, roomChannelName } from "@/lib/realtime/channel";
import type { RoomView } from "@/types/room";

export interface RealtimeConfig {
  url: string;
  anonKey: string;
}

/** Without realtime we poll quickly; with it, polling is just a heartbeat + safety net. */
const POLL_FAST_MS = 2_000;
const POLL_SLOW_MS = 10_000;

let browserClient: SupabaseClient | undefined;
function getBrowserClient(config: RealtimeConfig) {
  browserClient ??= createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}

/**
 * Keeps a room view in sync. The server is the source of truth: realtime pings
 * only say "something changed", then we refetch. Also refetches when the tab
 * becomes visible again or the network comes back, so a phone that slept or
 * lost signal catches up on its own.
 */
export function useRoom(initial: RoomView, realtime: RealtimeConfig | null) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const inFlight = useRef(false);
  const roomId = initial.room.id;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setView(await apiFetch<RoomView>(`/api/rooms/${roomId}`));
      setError(null);
    } catch (err) {
      // Network blips keep the last good view; membership errors are terminal.
      if (err instanceof ApiError && err.code !== "network" && err.code !== "rate_limited") setError(err.code);
    } finally {
      inFlight.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    if (!realtime) return;
    const supabase = getBrowserClient(realtime);
    const channel = supabase
      .channel(roomChannelName(roomId))
      .on("broadcast", { event: ROOM_CHANGED_EVENT }, () => void refresh())
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refresh(); // catch anything missed while connecting
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime, roomId, refresh]);

  useEffect(() => {
    if (error) return;
    const timer = setInterval(() => void refresh(), connected ? POLL_SLOW_MS : POLL_FAST_MS);
    return () => clearInterval(timer);
  }, [connected, error, refresh]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  return { view, error, refresh };
}
