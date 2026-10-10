import { z } from "zod";
import { MODES } from "@/types/room";
import { GAME_TYPES, QUESTION_CATEGORIES, type Question } from "@/types/game";
import chaosNight from "@/content/questions/chaos-night.json";
import dateNight from "@/content/questions/date-night.json";
import mindReader from "@/content/questions/mind-reader.json";
import mostLikely from "@/content/questions/most-likely.json";
import thisOrThat from "@/content/questions/this-or-that.json";

const option = z.object({ id: z.string().regex(/^[a-z]$/), label: z.string().min(1).max(40) });

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,64}$/),
    gameType: z.enum(GAME_TYPES),
    modes: z.array(z.enum(MODES)).min(1),
    category: z.enum(QUESTION_CATEGORIES),
    intensity: z.enum(["safe", "playful", "bold"]),
    prompt: z.string().min(3).max(120),
    options: z.array(option).max(4),
    active: z.boolean().default(true),
    pack: z
      .string()
      .regex(/^[a-z0-9-]{3,40}$/)
      .nullish()
      .transform((v) => v ?? undefined),
    award: z
      .string()
      .min(1)
      .max(40)
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (q.gameType === "this_or_that" && q.options.length !== 2) issue("This or That needs exactly 2 options");
    if (q.gameType === "mind_reader") {
      if (q.options.length < 2) issue("Mind Reader needs 2–4 options");
      if (!q.prompt.includes("{name}")) issue("Mind Reader prompts must include {name}");
      if (q.modes.includes("circle")) issue("Mind Reader is 2-player only");
    }
    if (q.gameType === "most_likely") {
      if (q.options.length !== 0) issue("Who's More Likely is answered with players, not options");
      if (!q.award) issue("Who's More Likely needs an award badge for Circle");
    }
  });

/**
 * The question bank shipped with the app. It seeds Supabase (`npm run db:seed-sql`)
 * and backs the in-memory store, so both always serve the same questions.
 */
export const BUNDLED_QUESTIONS: Question[] = z
  .array(questionSchema)
  .parse([...mindReader, ...mostLikely, ...thisOrThat, ...chaosNight, ...dateNight]);
