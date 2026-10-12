/**
 * Chain Reactions content (Mutation Machine): seed objects and mutation cards.
 * Plain data in content/chaos/*.json, validated here like the quiz questions.
 * See docs/usvsus-4/05-chaos-dna.md.
 */
import { z } from "zod";
import mutationsJson from "@/content/chaos/mutations.json";
import objectsJson from "@/content/chaos/objects.json";

const id = z.string().regex(/^[a-z0-9-]{3,48}$/);

const objectCard = z.object({
  id: id.startsWith("obj-"),
  label: z.string().min(2).max(30),
  family: z.string().regex(/^[a-z]+$/),
});

const mutationCard = z.object({
  id: id.startsWith("mut-"),
  /** Shown to detectives as a choice. */
  label: z.string().min(2).max(30),
  /** Shown only to the mutator: how to draw it so it's visible. */
  drawHint: z.string().min(10).max(120),
  family: z.string().regex(/^[a-z]+$/),
  /** Object families this mutation makes no sense on (e.g. wheels on a vehicle). */
  incompatibleWith: z.array(z.string()).optional(),
});

export type ObjectCard = z.infer<typeof objectCard>;
export type MutationCard = z.infer<typeof mutationCard>;

export interface ChaosContent {
  contentVersion: number;
  objects: ObjectCard[];
  mutations: MutationCard[];
}

const objectsFile = z.object({ contentVersion: z.number().int().positive(), objects: z.array(objectCard) });
const mutationsFile = z.object({ contentVersion: z.number().int().positive(), mutations: z.array(mutationCard) });

function load(): ChaosContent {
  const objects = objectsFile.parse(objectsJson);
  const mutations = mutationsFile.parse(mutationsJson);
  return {
    contentVersion: Math.max(objects.contentVersion, mutations.contentVersion),
    objects: objects.objects,
    mutations: mutations.mutations,
  };
}

/** The bundled content (also what the generator uses in tests). */
export const CHAOS_CONTENT: ChaosContent = load();
