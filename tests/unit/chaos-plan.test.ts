import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { assign, choiceKey, MAX_PLAYERS, MIN_PLAYERS, planMatch, type MatchPlan } from "@/lib/chaos/plan";

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const plan = (n: number, seed: number, recent?: Parameters<typeof planMatch>[0]["recent"]) =>
  planMatch({ playerIds: players(n), content: CHAOS_CONTENT, seed, recent });
const family = (id: string) => [...CHAOS_CONTENT.objects, ...CHAOS_CONTENT.mutations].find((c) => c.id === id)!.family;
const who = (p: MatchPlan, step: number, chain: number) =>
  p.assignments.filter((a) => a.step === step && a.chain === chain).map((a) => a.playerId);

const SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS);
const SEEDS = Array.from({ length: 600 }, (_, i) => i * 7919 + 1);

describe("match plan (Chaos DNA)", () => {
  it("is deterministic: same players and seed, same plan", () => {
    expect(plan(6, 42)).toEqual(plan(6, 42));
    expect(plan(6, 42)).not.toEqual(plan(6, 43));
  });

  it.each(SIZES)("gives everyone an equal share of every step with %i players", (n) => {
    for (const seed of SEEDS.slice(0, 50)) {
      const p = plan(n, seed);
      for (const step of p.steps) {
        const counts = new Map(p.playerOrder.map((id) => [id, 0]));
        for (const a of p.assignments.filter((x) => x.step === step.index))
          counts.set(a.playerId, counts.get(a.playerId)! + 1);
        expect(new Set(counts.values()).size, `step ${step.index}`).toBe(1);
      }
    }
  });

  it.each(SIZES)("never asks anyone to detect what they made, with %i players", (n) => {
    for (const seed of SEEDS) {
      const p = plan(n, seed);
      for (let chain = 0; chain < n; chain++) {
        const [creator] = who(p, 1, chain);
        const [mutator1] = who(p, 2, chain);
        const [mutator2] = who(p, 4, chain);
        expect(creator).not.toBe(mutator1);
        expect(who(p, 5, chain)).not.toContain(mutator2);
        if (n === 2) {
          // Duo: you detect your own chain (you know the original, not the mutation).
          expect(who(p, 3, chain)).toEqual([creator]);
          expect(mutator2).toBe(mutator1);
        } else {
          expect(who(p, 3, chain)).not.toContain(creator);
          expect(who(p, 3, chain)).not.toContain(mutator1);
          expect(mutator2).not.toBe(creator);
          expect(mutator2).not.toBe(mutator1);
          expect(who(p, 3, chain).length).toBe(Math.min(3, n - 2));
          expect(who(p, 5, chain).length).toBe(Math.min(3, n - 1));
        }
      }
    }
  });

  it.each(SIZES)("never repeats a card in a match, and keeps mutations compatible (%i players)", (n) => {
    for (const seed of SEEDS) {
      const p = plan(n, seed);
      const objects = p.chains.map((c) => c.objectId);
      const mutations = p.chains.flatMap((c) => c.mutationIds);
      expect(new Set(objects).size).toBe(n);
      expect(new Set(mutations).size).toBe(2 * n);
      for (const c of p.chains) {
        const objFamily = family(c.objectId);
        for (const id of c.mutationIds) {
          const card = CHAOS_CONTENT.mutations.find((m) => m.id === id)!;
          expect(card.incompatibleWith ?? []).not.toContain(objFamily);
        }
        expect(family(c.mutationIds[0])).not.toBe(family(c.mutationIds[1]));
      }
    }
  });

  it.each(SIZES)("offers 4 distinct choices from 4 families, always including the answer (%i players)", (n) => {
    for (const seed of SEEDS.slice(0, 200)) {
      const p = plan(n, seed);
      p.chains.forEach((c, chain) => {
        const s3 = p.choices[choiceKey(chain, 3)];
        const s5 = p.choices[choiceKey(chain, 5)];
        for (const [list, answer] of [
          [s3.mutationIds, c.mutationIds[0]],
          [s5.mutationIds, c.mutationIds[1]],
          ...(s3.objectIds ? [[s3.objectIds, c.objectId] as const] : []),
        ] as const) {
          expect(list).toHaveLength(4);
          expect(list).toContain(answer);
          expect(new Set(list.map(family)).size).toBe(4);
        }
        expect(s3.mutationIds).not.toContain(c.mutationIds[1]); // the next mutation isn't a decoy
        expect(s5.mutationIds).not.toContain(c.mutationIds[0]); // nor the previous one
        expect(Boolean(s3.objectIds)).toBe(n > 2); // Duo detectives drew the original
      });
    }
  });

  it("avoids the previous match's cards when it can (rematch)", () => {
    const first = plan(10, 7);
    const second = plan(10, 8, {
      objectIds: first.chains.map((c) => c.objectId),
      mutationIds: first.chains.flatMap((c) => c.mutationIds),
    });
    const reusedObjects = second.chains.filter((c) => first.chains.some((f) => f.objectId === c.objectId));
    expect(reusedObjects).toEqual([]);
  });

  it("uses the same uniform offsets for any player order", () => {
    expect(assign(["a", "b", "c"]).filter((a) => a.step === 4)).toEqual([
      { step: 4, chain: 0, playerId: "c", role: "mutator" },
      { step: 4, chain: 1, playerId: "a", role: "mutator" },
      { step: 4, chain: 2, playerId: "b", role: "mutator" },
    ]);
  });
});
