import { describe, expect, it } from "vitest";
import { MAX_POINTS, MAX_STROKES, strokePath, validateArtifact } from "@/lib/chaos/artifact";

const line = { c: 0, w: 1 as const, p: [10, 10, 100, 120] };

describe("artifact validation", () => {
  it("accepts a normal drawing and reports its size", () => {
    const r = validateArtifact({ medium: "drawing", strokes: [line, { c: 2, w: 2, p: [5, 5] }] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.bytes).toBeGreaterThan(0);
  });

  it("accepts and tidies text, refusing empty or overlong text", () => {
    expect(validateArtifact({ medium: "text", text: "  a tiny\n\nangry   toaster " })).toMatchObject({
      ok: true,
      value: { medium: "text", text: "a tiny angry toaster" },
    });
    expect(validateArtifact({ medium: "text", text: "   " })).toEqual({ ok: false, error: "invalid_artifact" });
    expect(validateArtifact({ medium: "text", text: "x".repeat(81) })).toEqual({
      ok: false,
      error: "invalid_artifact",
    });
    expect(validateArtifact({ medium: "text", text: "​​" })).toEqual({ ok: false, error: "invalid_artifact" });
  });

  it.each([
    ["markup instead of numbers", { medium: "drawing", strokes: [{ c: 0, w: 1, p: ["<script>"] }] }],
    ["coordinates off the canvas", { medium: "drawing", strokes: [{ c: 0, w: 1, p: [-1, 700] }] }],
    ["fractional coordinates", { medium: "drawing", strokes: [{ c: 0, w: 1, p: [1.5, 2] }] }],
    ["an odd number of values", { medium: "drawing", strokes: [{ c: 0, w: 1, p: [1, 2, 3] }] }],
    ["a colour outside the palette", { medium: "drawing", strokes: [{ c: 9, w: 1, p: [1, 2] }] }],
    ["a raw CSS colour", { medium: "drawing", strokes: [{ c: "red", w: 1, p: [1, 2] }] }],
    ["an unknown medium", { medium: "svg", svg: "<svg onload=alert(1)>" }],
    ["no strokes", { medium: "drawing", strokes: [] }],
    ["too many strokes", { medium: "drawing", strokes: Array.from({ length: MAX_STROKES + 1 }, () => line) }],
    ["nothing at all", null],
  ])("refuses %s", (_label, input) => {
    expect(validateArtifact(input)).toMatchObject({ ok: false });
  });

  it("refuses drawings with too many points in total", () => {
    const big = { c: 0, w: 1, p: Array.from({ length: 2000 }, (_, i) => i % 600) }; // 1,000 points
    const r = validateArtifact({
      medium: "drawing",
      strokes: Array.from({ length: MAX_POINTS / 1000 + 1 }, () => big),
    });
    expect(r).toEqual({ ok: false, error: "artifact_too_large" });
  });

  it("builds SVG paths only from numbers", () => {
    expect(strokePath(line)).toBe("M10 10L100 120");
    expect(strokePath({ c: 0, w: 1 as const, p: [5, 6] })).toBe("M5 6l0.01 0");
  });
});
