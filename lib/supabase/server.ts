import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

/** Secret-key (service_role) client. Bypasses RLS — only ever use on the server. */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const env = getServerEnv();
  if (env.store !== "supabase") throw new Error("Supabase is not configured");
  admin = createClient(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
