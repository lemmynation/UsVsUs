import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { choiceKey, planMatch, type MatchPlan } from "@/lib/chaos/plan";
import { scoreDetectStep } from "@/lib/chaos/scoring";
import { buildChaosWrapped, chaosHeadline } from "@/lib/chaos/wrapped";
import type { ChaosContribution } from "@/types/chaos";

const NAMES = ["Lem", "Ana", "Ben", "Cy", "Dee"];
const plan = (n: number, seed = 11) =>
  planMatch({ playerIds: Array.from({ length: n }, (_, i) => `p${i}`), content: CHAOS_CONTENT, seed });
const label = (id: string) => [...CHAOS_CONTENT.objects, ...CHAOS_CONTENT.mutations].find((x) => x.id === id)!.label;

/** Everyone draws everything; detectives answer, right unless `wrong(step, chain, player)`. */
function playAll(p: MatchPlan, wrong: (step: number, chain: number, player: string) => boolean = () => false) {
  const out: ChaosContribution[] = [];
  const base = { matchId: "m1", version: 1, submittedAt: "2026-10-13T10:00:00Z" };
  for (const a of p.assignments) {
    if (a.role !== "detective") {
      const artifact = { medium: "drawing" as const, strokes: [{ c: 0, w: 1 as const, p: [1, 2, 3, 4] }] };
      out.push({
        ...base,
        step: a.step,
        chain: a.chain,
        playerId: a.playerId,
        payload: { kind: "artifact", artifact },
      });
      continue;
    }
    const chain = p.chains[a.chain];
    const set = p.choices[choiceKey(a.chain, a.step)];
    const right = chain.mutationIds[a.step === 3 ? 0 : 1];
    const miss = wrong(a.step, a.chain, a.playerId);
    out.push({
      ...base,
      step: a.step,
      chain: a.chain,
      playerId: a.playerId,
      payload: {
        kind: "answer",
        answer: {
          mutationId: miss ? set.mutationIds.find((m) => m !== right)! : right,
          ...(set.objectIds ? { objectId: chain.objectId } : {}),
        },
      },
    });
  }
  return out;
}

function report(n: number, wrong?: (step: number, chain: number, player: string) => boolean, inRoom = n) {
  const p = plan(n);
  const contributions = playAll(p, wrong);
  const answers = contributions.flatMap((c) =>
    c.payload.kind === "answer" ? [{ step: c.step, chain: c.chain, playerId: c.playerId, ...c.payload.answer }] : [],
  );
  const none = { artifacts: new Set<string>() };
  const scores = [...scoreDetectStep(p, 3, answers, none), ...scoreDetectStep(p, 5, answers, none)];
  return {
    plan: p,
    report: buildChaosWrapped({
      matchId: "m1",
      roomName: null,
      plan: p,
      contributions,
      scores,
      players: p.playerOrder.slice(0, inRoom).map((id, i) => ({ id, nickname: NAMES[i] })),
      content: CHAOS_CONTENT,
    }),
  };
}

describe("Mutation Machine Group Wrapped", () => {
  it("ranks everyone by locked-in points with their titles", () => {
    const { report: r } = report(4);
    expect(r.players).toHaveLength(4);
    expect(r.players.map((p) => p.points)).toEqual([...r.players.map((p) => p.points)].sort((a, b) => b - a));
    expect(r.teamScore).toBe(r.players.reduce((n, p) => n + p.points, 0));
    expect(r.spotRate).toBe(1);
    expect(r.sync).toBeNull();
    expect(chaosHeadline(r)).toBe("100% of mutations spotted");
  });

  it("picks the mutation that fooled the most detectives and the clearest other one", () => {
    // Everyone misses chain 1's first mutation; one detective misses chain 2's.
    const { plan: p, report: r } = report(5, (step, chain, player) => {
      if (step === 3 && chain === 1) return true;
      return step === 3 && chain === 2 && player === p2First(chain);
    });
    function p2First(chain: number) {
      return plan(5).assignments.find((a) => a.step === 3 && a.chain === chain && a.role === "detective")!.playerId;
    }
    expect(r.sneakiest).toMatchObject({
      label: label(p.chains[1].mutationIds[0]),
      object: label(p.chains[1].objectId),
      mutatorId: p.assignments.find((a) => a.step === 2 && a.chain === 1)!.playerId,
      spotted: 0,
      guesses: 3,
    });
    expect(r.clearest).not.toBeNull();
    expect(r.clearest!.spotted).toBe(r.clearest!.guesses);
    expect(r.spotRate).toBeLessThan(1);
  });

  it("has no sneakiest mutation when every one was spotted", () => {
    expect(report(4).report.sneakiest).toBeNull();
  });

  it("is a co-op score and sync for a duo", () => {
    const { report: r } = report(2, (step) => step === 5);
    expect(r.isDuo).toBe(true);
    expect(r.sync).toBe(0.5);
    expect(chaosHeadline(r)).toBe("50% in sync");
    expect(r.players.every((p) => p.title === "Wildcard")).toBe(true); // below 75% sync
  });

  it("keeps a player who left (they drew a chain), without a nickname or points", () => {
    const { report: r } = report(4, undefined, 3);
    expect(r.players).toHaveLength(4);
    expect(r.players.map((p) => p.nickname)).toEqual(expect.arrayContaining(["Lem", "Ana", "Ben", null]));
    expect(r.players.find((p) => p.nickname === null)!.points).toBe(0);
    expect(r.teamScore).toBe(r.players.reduce((n, p) => n + p.points, 0));
  });

  it("never carries drawings or who guessed what", () => {
    const { plan: p, report: r } = report(5, (step, chain) => chain === 0 && step === 5);
    const json = JSON.stringify(r);
    expect(json).not.toContain("strokes");
    expect(json).not.toMatch(/mutationId|objectId|playerId/);
    // Mutation and object card ids are fine to omit: only labels are shown.
    for (const c of p.chains) expect(json).not.toContain(`"${c.objectId}"`);
  });
});
