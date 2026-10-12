/**
 * What a phone may send for a create/mutate step: a drawing as plain numbers, or
 * a short text ("Describe instead"). Validated on the server before storing;
 * drawings are rendered as SVG paths we build ourselves, never as user markup.
 * Limits: docs/usvsus-4/10-media-privacy.md.
 */
import { z } from "zod";

/** Logical canvas size; phones scale it to fit. */
export const CANVAS_SIZE = 600;
export const MAX_STROKES = 300;
export const MAX_POINTS = 8000;
export const MAX_ARTIFACT_BYTES = 65536;
export const MAX_TEXT = 80;
/** Pen colours by index (ink, red, blue, green) — the palette is ours, not the client's. */
export const INK = ["#1a1325", "#e5484d", "#3b82f6", "#22a06b"] as const;

const coordinate = z.number().int().min(0).max(CANVAS_SIZE);

const stroke = z.object({
  /** Colour index into INK. */
  c: z
    .number()
    .int()
    .min(0)
    .max(INK.length - 1),
  /** Width: 1 thin, 2 thick. */
  w: z.union([z.literal(1), z.literal(2)]),
  /** Flat [x0, y0, x1, y1, …]; a dot is one point. */
  p: z
    .array(coordinate)
    .min(2)
    .max(MAX_POINTS * 2)
    .refine((xs) => xs.length % 2 === 0, "points come in x,y pairs"),
});

export type Stroke = z.infer<typeof stroke>;

const drawing = z.object({ medium: z.literal("drawing"), strokes: z.array(stroke).min(1).max(MAX_STROKES) });
const text = z.object({ medium: z.literal("text"), text: z.string().trim().min(1).max(MAX_TEXT) });

export const artifactSchema = z.discriminatedUnion("medium", [drawing, text]);
export type Artifact = z.infer<typeof artifactSchema>;

export type ArtifactError = "invalid_artifact" | "artifact_too_large";

/** Parses and checks an incoming artifact. Returns the cleaned value and its stored size. */
export function validateArtifact(
  input: unknown,
): { ok: true; value: Artifact; bytes: number } | { ok: false; error: ArtifactError } {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_artifact" };
  const value =
    parsed.data.medium === "text" ? { medium: "text" as const, text: cleanText(parsed.data.text) } : parsed.data;
  if (value.medium === "text" && value.text.length === 0) return { ok: false, error: "invalid_artifact" };
  if (value.medium === "drawing") {
    const points = value.strokes.reduce((n, s) => n + s.p.length / 2, 0);
    if (points > MAX_POINTS) return { ok: false, error: "artifact_too_large" };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  if (bytes > MAX_ARTIFACT_BYTES) return { ok: false, error: "artifact_too_large" };
  return { ok: true, value, bytes };
}

// Same rule as nicknames: no control/invisible characters, single spaces (keeps ZWJ emoji).
const INVISIBLE = /(?!‍)[\p{Cc}\p{Cf}]/gu;
function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").replace(INVISIBLE, "").replace(/ {2,}/g, " ").trim();
}

/** SVG path data for a stroke, built only from validated numbers. */
export function strokePath(s: Stroke): string {
  const [x0, y0, ...rest] = s.p;
  if (rest.length === 0) return `M${x0} ${y0}l0.01 0`; // a dot
  let d = `M${x0} ${y0}`;
  for (let i = 0; i < rest.length; i += 2) d += `L${rest[i]} ${rest[i + 1]}`;
  return d;
}

export const strokeWidth = (s: Stroke) => (s.w === 2 ? 10 : 5);
