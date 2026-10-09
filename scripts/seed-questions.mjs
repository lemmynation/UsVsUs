// Loads content/packs.json and content/questions/*.json into a Supabase project through the API
// (same upserts as supabase/seed-questions.sql, which the SQL Editor can choke on at this size).
// Safe to re-run: updates existing rows and deactivates questions removed from content.
//
//   node --env-file=.env.local scripts/seed-questions.mjs              (development project)
//   node --env-file=.env.vercel-production scripts/seed-questions.mjs  (production project)
import { createRequire } from "node:module";
import { loadPacks, loadQuestions } from "./generate-question-seed.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (use --env-file=…).");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const fail = (step, error) => {
  console.error(`FAILED at ${step}: ${error.message}`);
  process.exit(1);
};

console.log(`Target: ${new URL(url).host}`);
const packs = loadPacks();
const questions = loadQuestions();

let r = await db.from("packs").upsert(
  packs.map((p) => ({
    slug: p.slug,
    name: p.name,
    mode_scope: p.modes,
    price_minor: p.priceMinor,
    currency: p.currency,
    is_free: false,
    active: true,
  })),
  { onConflict: "slug" },
);
if (r.error) fail("packs", r.error);

const { data: packRows, error: packError } = await db.from("packs").select("id, slug");
if (packError) fail("pack ids", packError);
const packId = Object.fromEntries(packRows.map((p) => [p.slug, p.id]));

r = await db.from("questions").upsert(
  questions.map((q) => ({
    id: q.id,
    game_type: q.gameType,
    modes: q.modes,
    category: q.category,
    intensity: q.intensity,
    prompt: q.prompt,
    options: q.options,
    award: q.award ?? null,
    pack_id: q.pack ? packId[q.pack] : null,
    active: true,
  })),
  { onConflict: "id" },
);
if (r.error) fail("questions", r.error);

// Never delete a question (running games and history point at it): deactivate it instead.
const ids = questions.map((q) => `"${q.id}"`).join(",");
r = await db.from("questions").update({ active: false }).not("id", "in", `(${ids})`).eq("active", true);
if (r.error) fail("deactivate", r.error);

const { count } = await db.from("questions").select("*", { count: "exact", head: true }).eq("active", true);
console.log(`Loaded ${packs.length} pack(s) and ${questions.length} questions; ${count} active in the database.`);
