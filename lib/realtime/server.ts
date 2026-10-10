import "server-only";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { REACTION_EVENT, ROOM_CHANGED_EVENT, roomChannelName, type Reaction } from "./channel";

/**
 * Tells every client in the room to refetch. The payload carries no room data —
 * clients always reload state from the server, so nothing private is broadcast.
 */
export async function notifyRoomChanged(roomId: string): Promise<void> {
  if (getServerEnv().store !== "supabase") return; // clients fall back to polling
  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(roomChannelName(roomId));
  try {
    const result = await channel.httpSend(ROOM_CHANGED_EVENT, { at: Date.now() });
    if (!result.success) console.error("[realtime] broadcast failed", result.status, result.error);
  } catch (error) {
    console.error("[realtime] broadcast failed", error);
  } finally {
    await supabase.removeChannel(channel);
  }
}

/** Live reaction: just the emoji and the sender's nonce (see REACTION_EVENT). No-op without realtime. */
export async function broadcastReaction(roomId: string, emoji: Reaction, nonce: string): Promise<void> {
  if (getServerEnv().store !== "supabase") return;
  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(roomChannelName(roomId));
  try {
    const result = await channel.httpSend(REACTION_EVENT, { e: emoji, n: nonce });
    if (!result.success) console.error("[realtime] reaction failed", result.status, result.error);
  } catch (error) {
    console.error("[realtime] reaction failed", error);
  } finally {
    await supabase.removeChannel(channel);
  }
}
