import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUND_LINEUP } from "@/lib/game/engines";
import { GAME_CONFIG } from "@/lib/game/state-machine";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import { PACKS } from "@/lib/premium/catalog";
import { MODES } from "@/types/room";
import { buildSeedSql, loadPacks, loadQuestions } from "@/scripts/generate-question-seed.mjs";

describe("question bank", () => {
  it("has unique ids and unique prompts", () => {
    expect(new Set(BUNDLED_QUESTIONS.map((q) => q.id)).size).toBe(BUNDLED_QUESTIONS.length);
    const prompts = BUNDLED_QUESTIONS.map((q) => q.prompt.toLowerCase());
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("gives every option a unique id within its question", () => {
    for (const q of BUNDLED_QUESTIONS) {
      expect(new Set(q.options.map((o) => o.id)).size, q.id).toBe(q.options.length);
    }
  });

  it.each(MODES)("has enough questions of every game type for 10 fresh %s games", (mode) => {
    const games = 10; // beta: regular groups shouldn't see repeats for a good while
    for (const gameType of new Set(ROUND_LINEUP[mode])) {
      const rounds = ROUND_LINEUP[mode].filter((t) => t === gameType).length;
      const available = BUNDLED_QUESTIONS.filter(
        (q) => !q.pack && q.gameType === gameType && q.modes.includes(mode),
      ).length;
      expect(available, `${mode} ${gameType}`).toBeGreaterThanOrEqual(rounds * GAME_CONFIG.questionsPerRound * games);
    }
  });

  it("only uses emoji that older phones can show (Unicode 12 or earlier)", () => {
    // Newer emoji (e.g. 🥹 🪨 🥷) render as empty boxes on Windows 10 and older Android/iOS.
    const newer =
      /[\u{1F972}\u{1F977}-\u{1F979}\u{1F90C}\u{1F9CC}\u{1F6D6}\u{1F6D7}\u{1F6DC}-\u{1F6DF}\u{1F7F0}\u{1FA75}-\u{1FA77}\u{1FA7B}\u{1FA7C}\u{1FA83}-\u{1FA88}\u{1FA96}-\u{1FAFF}]/u;
    for (const q of BUNDLED_QUESTIONS) {
      const text = [q.prompt, q.award ?? "", ...q.options.map((o) => o.label)].join(" ");
      expect(newer.test(text), `${q.id}: ${text}`).toBe(false);
    }
  });

  it("gives every pack's questions a pack that exists, in a mode the pack is sold for", () => {
    for (const q of BUNDLED_QUESTIONS.filter((x) => x.pack)) {
      const pack = PACKS.find((p) => p.slug === q.pack);
      expect(pack, q.id).toBeDefined();
      expect(
        q.modes.every((m) => pack!.modes.includes(m)),
        q.id,
      ).toBe(true);
    }
  });

  it.each(PACKS.map((p) => [p.slug, p] as const))("has at least 40 questions in the %s pack", (_slug, pack) => {
    expect(BUNDLED_QUESTIONS.filter((q) => q.pack === pack.slug).length).toBeGreaterThanOrEqual(40);
  });

  it("keeps default content safe or playful (bold needs its own review per the design doc)", () => {
    expect(BUNDLED_QUESTIONS.every((q) => q.intensity !== "bold")).toBe(true);
  });

  it("has an up-to-date supabase/seed-questions.sql (run `npm run db:seed-sql`)", () => {
    const committed = readFileSync("supabase/seed-questions.sql", "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildSeedSql(loadQuestions(), loadPacks()));
  });
});
