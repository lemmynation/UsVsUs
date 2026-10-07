import { z } from "zod";
import { MODES } from "@/types/room";
import { GAME_TYPES, QUESTION_CATEGORIES, type Question } from "@/types/game";
import thisOrThat from "@/content/questions/this-or-that.json";

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),
  gameType: z.enum(GAME_TYPES),
  modes: z.array(z.enum(MODES)).min(1),
  category: z.enum(QUESTION_CATEGORIES),
  intensity: z.enum(["safe", "playful", "bold"]),
  prompt: z.string().min(3).max(120),
  options: z
    .array(z.object({ id: z.string().regex(/^[a-z]$/), label: z.string().min(1).max(40) }))
    .min(2)
    .max(4),
  active: z.boolean().default(true),
});

/**
 * The question bank shipped with the app. It seeds Supabase (`npm run db:seed-sql`)
 * and backs the in-memory store, so both always serve the same questions.
 */
export const BUNDLED_QUESTIONS: Question[] = z.array(questionSchema).parse(thisOrThat);
