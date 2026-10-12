"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CANVAS_SIZE, INK, MAX_POINTS, MAX_STROKES, type Stroke } from "@/lib/chaos/artifact";
import type { Layer } from "@/lib/chaos/projections";
import { cn } from "@/lib/utils";
import { LayerStrokes, StrokePaths } from "./layers-view";

const COLOR_NAMES = ["Black", "Red", "Blue", "Green"];
/** Skip points closer than this (canvas units) to keep drawings small. */
const MIN_STEP = 3;

/**
 * Touch/mouse/pen drawing with Pointer Events. `base` layers (someone else's
 * drawing) sit underneath and can't be erased; undo/clear only touch your strokes.
 */
export function DrawingCanvas({
  base = [],
  strokes,
  onChange,
  label,
}: {
  base?: Layer[];
  strokes: Stroke[];
  onChange: (next: Stroke[]) => void;
  label: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useRef<Stroke | null>(null);
  /** Only the first finger draws; a second finger or a palm is ignored until it lifts. */
  const pointer = useRef<number | null>(null);
  /** The finished strokes when the pen went down; moves can arrive before React re-renders. */
  const finished = useRef<{ strokes: Stroke[]; points: number }>({ strokes: [], points: 0 });
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState<1 | 2>(1);
  const points = strokes.reduce((n, s) => n + s.p.length / 2, 0);
  const full = strokes.length >= MAX_STROKES || points >= MAX_POINTS;

  function toCanvas(e: React.PointerEvent): [number, number] {
    const box = svg.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(CANVAS_SIZE, Math.round(v)));
    return [
      clamp(((e.clientX - box.left) / box.width) * CANVAS_SIZE),
      clamp(((e.clientY - box.top) / box.height) * CANVAS_SIZE),
    ];
  }

  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (full || pointer.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toCanvas(e);
    drawing.current = { c: color, w: width, p: [x, y] };
    finished.current = { strokes, points };
    onChange([...strokes, drawing.current]);
  }

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const current = drawing.current;
    if (!current || e.pointerId !== pointer.current) return;
    const [x, y] = toCanvas(e);
    const [lx, ly] = current.p.slice(-2);
    const base = finished.current;
    if (Math.hypot(x - lx, y - ly) < MIN_STEP || base.points + current.p.length / 2 >= MAX_POINTS) return;
    current.p = [...current.p, x, y];
    onChange([...base.strokes, { ...current }]);
  }

  function up(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    drawing.current = null;
  }

  return (
    <div className="flex flex-col gap-3">
      <svg
        ref={svg}
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        role="img"
        aria-label={label}
        className="aspect-square w-full touch-none rounded-3xl bg-white select-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {base.map((layer) => (
          <LayerStrokes key={layer.step} layer={layer} />
        ))}
        <StrokePaths strokes={strokes} />
      </svg>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Pen colour" className="flex gap-1">
          {INK.map((ink, i) => (
            <button
              key={ink}
              type="button"
              aria-label={COLOR_NAMES[i]}
              aria-pressed={color === i}
              onClick={() => setColor(i)}
              className={cn(
                "focus-visible:ring-ring/50 size-11 rounded-full border-4 outline-none focus-visible:ring-3",
                color === i ? "border-foreground" : "border-transparent",
              )}
              style={{ background: ink }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={width === 2}
          onClick={() => setWidth(width === 1 ? 2 : 1)}
        >
          {width === 1 ? "✏️ Thin" : "🖍️ Thick"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={strokes.length === 0}
          onClick={() => onChange(strokes.slice(0, -1))}
        >
          ↶ Undo
        </Button>
        <Button type="button" variant="ghost" disabled={strokes.length === 0} onClick={() => onChange([])}>
          🗑 Clear
        </Button>
      </div>
      {full && (
        <p role="status" className="text-muted-foreground text-sm">
          That&apos;s as much as fits. Undo something to keep drawing.
        </p>
      )}
    </div>
  );
}
