import { CANVAS_SIZE, INK, strokePath, strokeWidth, type Stroke } from "@/lib/chaos/artifact";
import type { Layer } from "@/lib/chaos/projections";

/** Strokes as SVG paths (built from validated numbers only). */
export function StrokePaths({ strokes }: { strokes: Stroke[] }) {
  return (
    <g>
      {strokes.map((s, i) => (
        <path
          key={i}
          d={strokePath(s)}
          fill="none"
          stroke={INK[s.c] ?? INK[0]}
          strokeWidth={strokeWidth(s)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** One drawing layer (nothing for text or skipped layers). */
export function LayerStrokes({ layer }: { layer: Layer }) {
  return layer.artifact?.medium === "drawing" ? <StrokePaths strokes={layer.artifact.strokes} /> : null;
}

/**
 * A chain so far: drawn layers stacked in one picture, text layers as lines under
 * it, and a placeholder for work nobody submitted.
 */
export function LayersView({ layers, label }: { layers: Layer[]; label: string }) {
  const drawn = layers.filter((l) => l.artifact?.medium === "drawing");
  const texts = layers.filter((l) => l.artifact?.medium === "text");
  const skipped = layers.filter((l) => !l.artifact);
  return (
    <figure className="flex flex-col gap-2">
      {drawn.length > 0 && (
        <svg
          viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
          role="img"
          aria-label={label}
          className="aspect-square w-full rounded-3xl bg-white"
        >
          {drawn.map((l) => (
            <LayerStrokes key={l.step} layer={l} />
          ))}
        </svg>
      )}
      {texts.map((l) => (
        <p key={l.step} className="bg-card rounded-2xl p-4 text-lg">
          “{l.artifact?.medium === "text" ? l.artifact.text : ""}”
        </p>
      ))}
      {skipped.length > 0 && (
        <figcaption className="text-muted-foreground text-sm">
          🙈 {skipped.length === layers.length ? "Nobody drew this one." : "Part of this was skipped."}
        </figcaption>
      )}
    </figure>
  );
}
