import "server-only";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ROOM_CHANGED_EVENT, roomChannelName } from "./channel";

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
