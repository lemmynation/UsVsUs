import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Force the in-memory store (local dev / E2E). Never use for real players. */
  ROOM_STORE: z.enum(["supabase", "memory"]).optional(),
});

export type ServerEnv =
  { store: "memory" } | { store: "supabase"; supabaseUrl: string; anonKey: string; serviceRoleKey: string };

let cached: ServerEnv | undefined;

const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v);

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: blank(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: blank(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: blank(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ROOM_STORE: blank(process.env.ROOM_STORE),
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const supabaseVars = [env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY];
  const configured = supabaseVars.filter(Boolean).length;

  if (env.ROOM_STORE === "memory") {
    cached = { store: "memory" };
  } else if (configured === 3) {
    cached = {
      store: "supabase",
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    };
  } else if (configured > 0 || env.ROOM_STORE === "supabase") {
    throw new Error(
      "Supabase is partly configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase is not configured. Set the Supabase variables (see .env.example).");
  } else {
    console.warn("[us-vs-us] Supabase not configured — using in-memory rooms. Data resets on restart.");
    cached = { store: "memory" };
  }
  return cached;
}

/** Values safe to send to the browser for realtime subscriptions. */
export function getPublicRealtimeConfig(): { url: string; anonKey: string } | null {
  const env = getServerEnv();
  return env.store === "supabase" ? { url: env.supabaseUrl, anonKey: env.anonKey } : null;
}
