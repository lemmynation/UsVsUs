// Checks a Supabase project is fully set up and locked down: every table, every function the
// server calls (read from supabase/migrations), the seeds, and that the public key can't get in.
// Read-only apart from calls that change nothing (empty arguments).
//
//   node --env-file=.env.vercel-production scripts/check-db.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error("Set the three Supabase variables (use --env-file=…).");
  process.exit(2);
}
const opts = { auth: { persistSession: false } };
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, opts);
const pub = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
console.log(`Target: ${new URL(url).host}\n`);

// Tables and functions, as the migrations define them (latest definition wins).
const tables = new Set();
const functions = {};
for (const file of readdirSync("supabase/migrations").sort()) {
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  for (const m of sql.matchAll(/create table (?:if not exists )?([a-z_]+)/g)) tables.add(m[1]);
  for (const m of sql.matchAll(/create (?:or replace )?function ([a-z_]+)\(([\s\S]*?)\)\s*returns/g)) {
    functions[m[1]] = [...m[2].matchAll(/(p_[a-z_]+)/g)].map((x) => x[1]);
  }
}

const missingTables = [];
for (const t of tables) {
  // A real request, not HEAD: HEAD responses hide "table not found".
  const { error } = await admin.from(t).select("*").limit(1);
  if (error) missingTables.push(t);
}
check(`all ${tables.size} tables exist`, missingTables.length === 0, missingTables.join(", "));

const used = [
  ...new Set([...readFileSync("lib/rooms/supabase-store.ts", "utf8").matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1])),
];
const missingFns = [];
for (const fn of used.sort()) {
  const args = Object.fromEntries((functions[fn] ?? []).map((p) => [p, null]));
  const { error } = await admin.rpc(fn, args);
  if (error?.code === "PGRST202") missingFns.push(fn); // "function not found"
}
check(`all ${used.length} server functions exist`, missingFns.length === 0, missingFns.join(", "));
await admin.from("rate_limits").delete().is("key", null);

const { data: free } = await admin.from("packs").select("is_free").eq("slug", "free").maybeSingle();
check("seed.sql ran (free pack)", free?.is_free === true);
const { count } = await admin.from("questions").select("*", { count: "exact", head: true }).eq("active", true);
check("questions loaded", (count ?? 0) > 0, `${count ?? 0} active`);

const readable = [];
for (const t of tables) {
  const { data } = await pub.from(t).select("*").limit(1);
  if (data?.length) readable.push(t);
}
check("public key can't read any table", readable.length === 0, readable.join(", "));
const { error: writeError } = await pub
  .from("rooms")
  .insert({ join_code: "ZZZZZZ", mode: "couple", expires_at: new Date().toISOString() });
check("public key can't write", !!writeError);
const { error: rpcError } = await pub.rpc("rate_limit_hit", {
  p_key: "x",
  p_max: 1,
  p_window_ms: 1000,
  p_now: new Date().toISOString(),
});
check("public key can't call server functions", !!rpcError);

console.log(failures ? `\n${failures} check(s) failed.` : "\nDatabase is ready.");
process.exit(failures ? 1 : 0);
