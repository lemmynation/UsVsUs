import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { choiceKey, planMatch, type MatchPlan } from "@/lib/chaos/plan";
import { duoSync, scoreDetectStep, titlesFor, totals, type DetectAnswer, type Missing } from "@/lib/chaos/scoring";

const none: Missing = { artifacts: new Set() };
const plan = (n: number, seed = 11) =>
  planMatch({ playerIds: Array.from({ length: n }, (_, i) => `p${i}`), content: CHAOS_CONTENT, seed });
const at = (p: MatchPlan, step: number, chain: number, role: string) =>
  p.assignments.filter((a) => a.step === step && a.chain === chain && a.role === role).map((a) => a.playerId);
const wrongOf = (list: string[], right: string) => list.find((x) => x !== right)!;

/** Every assigned detective answers; `right` decides who gets it right. */
function answers(
  p: MatchPlan,
  step: 3 | 5,
  right: (player: string, chain: number) => { object: boolean; mutation: boolean },
) {
  const out: DetectAnswer[] = [];
  p.chains.forEach((c, chain) => {
    const set = p.choices[choiceKey(chain, step)];
    const answer = c.mutationIds[step === 3 ? 0 : 1];
    for (const playerId of at(p, step, chain, "detective")) {
      const r = right(playerId, chain);
      out.push({
        step,
        chain,
        playerId,
        mutationId: r.mutation ? answer : wrongOf(set.mutationIds, answer),
        ...(set.objectIds ? { objectId: r.object ? c.objectId : wrongOf(set.objectIds, c.objectId) } : {}),
      });
    }
  });
  return out;
}

describe("Mutation Machine scoring", () => {
  it("gives detectives +2/+1 and the mutator/creator +1 per detective who spotted their part", () => {
    const p = plan(5);
    const entries = scoreDetectStep(
      p,
      3,
      answers(p, 3, () => ({ object: true, mutation: true })),
      none,
    );
    const chain0 = entries.filter((e) => e.chain === 0);
    const detectives = at(p, 3, 0, "detective");
    expect(detectives).toHaveLength(3);
    for (const d of detectives) {
      expect(chain0).toContainEqual({ step: 3, chain: 0, playerId: d, reason: "detect_mutation", points: 2 });
      expect(chain0).toContainEqual({ step: 3, chain: 0, playerId: d, reason: "detect_object", points: 1 });
    }
    expect(chain0).toContainEqual({
      step: 3,
      chain: 0,
      playerId: at(p, 2, 0, "mutator")[0],
      reason: "mutation_seen",
      points: 3,
    });
    expect(chain0).toContainEqual({
      step: 3,
      chain: 0,
      playerId: at(p, 1, 0, "creator")[0],
      reason: "object_seen",
      points: 3,
    });
  });

  it("never gives negative points, and wrong answers earn nothing", () => {
    const p = plan(6);
    const entries = scoreDetectStep(
      p,
      3,
      answers(p, 3, () => ({ object: false, mutation: false })),
      none,
    );
    expect(entries).toEqual([]);
  });

  it("only counts answers from the assigned detectives (no scoring your own chain)", () => {
    const p = plan(4);
    const creator = at(p, 1, 0, "creator")[0];
    const sneaky: DetectAnswer = {
      step: 3,
      chain: 0,
      playerId: creator,
      mutationId: p.chains[0].mutationIds[0],
      objectId: p.chains[0].objectId,
    };
    expect(scoreDetectStep(p, 3, [sneaky], none)).toEqual([]);
  });

  it("asks about the second mutation in step 5 and credits the second mutator", () => {
    const p = plan(4);
    const entries = scoreDetectStep(
      p,
      5,
      answers(p, 5, () => ({ object: false, mutation: true })),
      none,
    );
    const mutator2 = at(p, 4, 1, "mutator")[0];
    expect(entries.filter((e) => e.chain === 1 && e.reason === "mutation_seen")).toEqual([
      { step: 5, chain: 1, playerId: mutator2, reason: "mutation_seen", points: 3 },
    ]);
    expect(entries.some((e) => e.reason === "detect_object" || e.reason === "object_seen")).toBe(false);
  });

  it("drops questions about missing work: no mutation points if it was never drawn, nothing for an undrawn chain", () => {
    const p = plan(4);
    const missing: Missing = { artifacts: new Set(["0:2", "1:1"]) };
    const entries = scoreDetectStep(
      p,
      3,
      answers(p, 3, () => ({ object: true, mutation: true })),
      missing,
    );
    expect(entries.some((e) => e.chain === 0 && (e.reason === "detect_mutation" || e.reason === "mutation_seen"))).toBe(
      false,
    );
    expect(entries.some((e) => e.chain === 0 && e.reason === "detect_object")).toBe(true);
    expect(entries.some((e) => e.chain === 1)).toBe(false);
  });

  it("scores Duo as a team (no object question) and reports sync", () => {
    const p = plan(2);
    const all = [
      ...answers(p, 3, () => ({ object: true, mutation: true })),
      ...answers(p, 5, (_pl, chain) => ({ object: true, mutation: chain === 0 })),
    ];
    const entries = [...scoreDetectStep(p, 3, all, none), ...scoreDetectStep(p, 5, all, none)];
    expect(entries.some((e) => e.reason === "detect_object")).toBe(false);
    expect(duoSync(p, all, none)).toBe(0.75);
    const t = totals(entries);
    expect(t.p0 + t.p1).toBe(3 * 3); // 3 right answers × (2 detective + 1 mutator)
    expect(titlesFor(p, entries, all, none)).toEqual({ p0: "Mind Meld", p1: "Mind Meld" });
  });

  it("gives everyone exactly one positive title, earned ones only to a clear leader", () => {
    const p = plan(6, 5);
    const sharp = p.playerOrder[0];
    const all = answers(p, 3, (player) => ({ object: player === sharp, mutation: player === sharp }));
    const entries = scoreDetectStep(p, 3, all, none);
    const titles = titlesFor(p, entries, all, none);
    expect(Object.keys(titles).sort()).toEqual([...p.playerOrder].sort());
    expect(titles[sharp]).toBe("Sharp Eye");
    expect(Object.values(titles).filter((t) => t === "Sharp Eye")).toHaveLength(1);
    for (const t of Object.values(titles))
      expect(["Sharp Eye", "Clear Signal", "Chaos Agent", "Wildcard"]).toContain(t);
  });

  it("is idempotent: scoring a step twice gives the same entries", () => {
    const p = plan(7, 3);
    const a = answers(p, 3, (pl, chain) => ({ object: (pl.length + chain) % 2 === 0, mutation: chain % 2 === 0 }));
    expect(scoreDetectStep(p, 3, a, none)).toEqual(scoreDetectStep(p, 3, a, none));
  });
});
