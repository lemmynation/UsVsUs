import { z } from "zod";
import { MODES, type Mode } from "@/types/room";
import packsJson from "@/content/packs.json";

const packSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  modes: z.array(z.enum(MODES)).min(1),
  /** Price in centavos (₱99 = 9900). The server's price is the only one that counts. */
  priceMinor: z.number().int().positive(),
  currency: z.literal("PHP"),
  tagline: z.string().min(1).max(80),
  perks: z.array(z.string().min(1).max(60)).min(1).max(4),
});

export type Pack = z.infer<typeof packSchema>;

/**
 * Premium packs (design doc §8). Plain data in content/packs.json; it also seeds
 * the `packs` table (`npm run db:seed-sql`), so code and database agree.
 */
export const PACKS: Pack[] = z.array(packSchema).parse(packsJson);

export function findPack(slug: string): Pack | undefined {
  return PACKS.find((p) => p.slug === slug);
}

export function packsForMode(mode: Mode): Pack[] {
  return PACKS.filter((p) => p.modes.includes(mode));
}

/** "₱99" / "₱149.50" */
export function formatPrice(priceMinor: number): string {
  const pesos = priceMinor / 100;
  return `₱${Number.isInteger(pesos) ? pesos : pesos.toFixed(2)}`;
}
