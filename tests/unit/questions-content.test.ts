import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUND_LINEUP } from "@/lib/game/engines";
import { GAME_CONFIG } from "@/lib/game/state-machine";
import { BUNDLED_QUESTIONS } from "@/lib/game/questions";
import { MODES } from "@/types/room";
import { buildSeedSql, loadQuestions } from "@/scripts/generate-question-seed.mjs";

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

  it.each(MODES)("has enough questions of every game type for 4 fresh %s games", (mode) => {
    const games = 4;
    for (const gameType of new Set(ROUND_LINEUP[mode])) {
      const rounds = ROUND_LINEUP[mode].filter((t) => t === gameType).length;
      const available = BUNDLED_QUESTIONS.filter((q) => q.gameType === gameType && q.modes.includes(mode)).length;
      expect(available, `${mode} ${gameType}`).toBeGreaterThanOrEqual(rounds * GAME_CONFIG.questionsPerRound * games);
    }
  });

  it("keeps default content safe or playful (bold needs its own review per the design doc)", () => {
    expect(BUNDLED_QUESTIONS.every((q) => q.intensity !== "bold")).toBe(true);
  });

  it("has an up-to-date supabase/seed-questions.sql (run `npm run db:seed-sql`)", () => {
    const committed = readFileSync("supabase/seed-questions.sql", "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildSeedSql(loadQuestions()));
  });
});
