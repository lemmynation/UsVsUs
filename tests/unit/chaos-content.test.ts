import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";

const { objects, mutations } = CHAOS_CONTENT;
const families = (xs: Array<{ family: string }>) => new Set(xs.map((x) => x.family));

describe("Mutation Machine content", () => {
  it("has enough cards for two 10-player matches with no repeats", () => {
    // Per match: one object per chain, two mutations per chain.
    expect(objects.length).toBeGreaterThanOrEqual(2 * 10);
    expect(mutations.length).toBeGreaterThanOrEqual(2 * 10 * 2);
    expect(objects.length).toBeGreaterThanOrEqual(80);
    expect(mutations.length).toBeGreaterThanOrEqual(40);
  });

  it("has unique ids and labels", () => {
    for (const list of [objects, mutations]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      expect(new Set(list.map((x) => x.label.toLowerCase())).size).toBe(list.length);
    }
  });

  it("spans enough families that every choice can have 4 different ones", () => {
    expect(families(objects).size).toBeGreaterThanOrEqual(4);
    expect(families(mutations).size).toBeGreaterThanOrEqual(4);
  });

  it("only marks mutations incompatible with object families that exist", () => {
    const objectFamilies = families(objects);
    for (const m of mutations) for (const f of m.incompatibleWith ?? []) expect(objectFamilies.has(f), m.id).toBe(true);
  });

  it("leaves every object with plenty of compatible mutations", () => {
    for (const o of objects) {
      const ok = mutations.filter((m) => !m.incompatibleWith?.includes(o.family));
      expect(ok.length, o.id).toBeGreaterThanOrEqual(30);
    }
  });

  it("keeps labels plain text (no emoji that older phones can't show)", () => {
    for (const x of [...objects, ...mutations]) expect(x.label, x.id).toMatch(/^[A-Za-z0-9 '-]+$/);
  });
});
