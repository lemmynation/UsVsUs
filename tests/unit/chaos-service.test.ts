import { describe, expect, it, vi } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import type { ChaosJob, ChaosPlayerView } from "@/lib/chaos/projections";
import { createChaosService } from "@/lib/chaos/service";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import type { Experience } from "@/types/room";

const NAMES = ["Lem", "Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy"];

async function setup(n: number, experience: Experience = "chain_reactions") {
  const store = new MemoryRoomStore();
  let clock = new Date("2026-10-12T10:00:00Z");
  let seed = 3;
  const service = createChaosService({
    store,
    content: CHAOS_CONTENT,
    now: () => clock,
    random: () => (seed = (seed * 16807) % 2147483647) / 2147483647,
  });
  const created = await store.createRoom({
    joinCode: "MUT234",
    mode: n === 2 ? "couple" : "circle",
    name: null,
    expiresAt: "2026-10-13T10:00:00Z",
    now: clock.toISOString(),
    host: { nickname: NAMES[0], sessionTokenHash: "s0" },
    experience,
  });
  if (created === "join_code_taken") throw new Error("taken");
  for (let i = 1; i < n; i++) {
    clock = new Date(clock.getTime() + 1000);
    await store.addPlayer({
      roomId: created.room.id,
      nickname: NAMES[i],
      sessionTokenHash: `s${i}`,
      maxPlayers: 10,
      now: clock.toISOString(),
    });
  }
  const players = await store.listPlayers(created.room.id);
  const hashOf = new Map(players.map((p) => [p.id, p.sessionTokenHash]));
  return {
    store,
    service,
    roomId: created.room.id,
    players,
    hashOf,
    tick: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function view(s: Setup, playerId: string): Promise<ChaosPlayerView> {
  const room = (await s.store.getRoomById(s.roomId))!;
  const players = await s.store.listPlayers(s.roomId);
  const me = players.find((p) => p.id === playerId)!;
  return (await s.service.viewFor(room, players, me))!;
}

/** A drawing with a marker stroke unique to (chain, step), so leaks are detectable. */
const marker = (chain: number, step: number) => [7 + chain, 500 + step];
const drawingFor = (chain: number, step: number) => ({
  medium: "drawing",
  strokes: [{ c: 0, w: 1, p: [...marker(chain, step), 300, 300] }],
});
const markerText = (chain: number, step: number) => `"p":[${marker(chain, step).join(",")}`;

/** Each player does their jobs; detectives pick right (or the first wrong choice when `right` says no). */
async function playStep(s: Setup, right: (playerId: string, job: ChaosJob) => boolean = () => true) {
  const match = (await s.store.getLatestChainMatch(s.roomId))!;
  for (const p of s.players) {
    const v = await view(s, p.id);
    for (const job of v.myJobs) {
      const base = {
        step: v.step!.index,
        chain: job.chain,
        idempotencyKey: `k-${p.id.slice(0, 8)}-${v.step!.index}-${job.chain}`,
      };
      if (job.kind === "detect") {
        const chain = match.plan.chains[job.chain];
        const ok = right(p.id, job);
        const answerMutation = chain.mutationIds[v.step!.index === 3 ? 0 : 1];
        const pick = (choices: Array<{ id: string }>, answer: string) =>
          ok ? answer : choices.find((c) => c.id !== answer)!.id;
        const r = await s.service.submit(s.roomId, s.hashOf.get(p.id)!, {
          ...base,
          answer: {
            mutationId: pick(job.mutationChoices, answerMutation),
            ...(job.objectChoices ? { objectId: pick(job.objectChoices, chain.objectId) } : {}),
          },
        });
        expect(r.ok).toBe(true);
      } else {
        const r = await s.service.submit(s.roomId, s.hashOf.get(p.id)!, {
          ...base,
          artifact: drawingFor(job.chain, v.step!.index),
        });
        expect(r.ok).toBe(true);
      }
    }
  }
}

async function finishReveal(s: Setup) {
  const host = s.hashOf.get(s.players[0].id)!;
  for (let i = 0; i < 20; i++) {
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    if (match.phase === "RECAP") return;
    const r = await s.service.advance(s.roomId, host, { stateVersion: match.stateVersion, action: "reveal_next" });
    expect(r.ok).toBe(true);
  }
}

describe("Chain Reactions service: full matches", () => {
  it.each([2, 3, 4, 6, 10])("plays a whole %i-player match to the recap", async (n) => {
    const s = await setup(n);
    expect(await s.service.start(s.roomId, "s0")).toMatchObject({ ok: true });
    for (let step = 1; step <= 5; step++) {
      expect((await view(s, s.players[0].id)).step?.index).toBe(step);
      await playStep(s);
    }
    // Everyone answered everything: each step closed by itself, now the reveal.
    expect((await s.store.getLatestChainMatch(s.roomId))!.phase).toBe("REVEAL");
    await finishReveal(s);
    const recap = (await view(s, s.players[1].id)).recap!;
    expect(Object.keys(recap.titles)).toHaveLength(n);
    const total = Object.values(recap.points).reduce((a, b) => a + b, 0);
    // Every detection right: per detect job +2 (+1 object in step 3 for 3+ players) and the same again for the authors.
    const step3 = n === 2 ? n : n * Math.min(3, n - 2);
    const step5 = n === 2 ? n : n * Math.min(3, n - 1);
    expect(total).toBe(step3 * (2 + 1) + (n === 2 ? 0 : step3 * (1 + 1)) + step5 * (2 + 1));
    if (n === 2) expect(recap.sync).toBe(1);
    expect((await s.store.getRoomById(s.roomId))!.status).toBe("WRAPPED");
  });
});

describe("Chain Reactions service: Group Wrapped", () => {
  async function playToRecap(n: number) {
    const s = await setup(n);
    await s.service.start(s.roomId, "s0");
    for (let step = 1; step <= 5; step++) await playStep(s, (playerId) => playerId !== s.players[2]?.id);
    await finishReveal(s);
    return s;
  }

  it("freezes the report as the match reaches the recap", async () => {
    const s = await playToRecap(4);
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    expect(match.wrapped).not.toBeNull();
    expect(match.wrapped!.players.map((p) => p.nickname).sort()).toEqual(["Ana", "Ben", "Cy", "Lem"]);
    const v = await view(s, s.players[1].id);
    expect(v.wrapped).toEqual(match.wrapped);
    // The recap's points and titles are the frozen ones.
    for (const p of match.wrapped!.players) {
      expect(v.recap!.points[p.id]).toBe(p.points);
      expect(v.recap!.titles[p.id]).toBe(p.title);
    }
  });

  it("reads the same after a player leaves", async () => {
    const s = await playToRecap(4);
    const before = await s.service.getWrapped(s.roomId, "s1");
    await s.store.removePlayer(s.players[3].id);
    const after = await s.service.getWrapped(s.roomId, "s1");
    expect(before.ok && after.ok).toBe(true);
    expect(after).toEqual(before);
  });

  it("still shows the recap on a database without migration 13 (report can't be saved)", async () => {
    const s = await setup(3);
    s.store.saveChaosWrapped = () => Promise.reject(new Error("function save_chaos_wrapped does not exist"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await s.service.start(s.roomId, "s0");
    for (let step = 1; step <= 5; step++) await playStep(s);
    await finishReveal(s);
    const v = await view(s, s.players[1].id);
    expect(v.wrapped?.players).toHaveLength(3);
    expect(Object.keys(v.recap!.titles)).toHaveLength(3);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("isn't there before the recap, nor for non-members", async () => {
    const s = await setup(3);
    await s.service.start(s.roomId, "s0");
    expect(await s.service.getWrapped(s.roomId, "s1")).toEqual({ ok: false, error: "game_not_finished" });
    expect((await view(s, s.players[1].id)).wrapped).toBeNull();
    expect((await s.service.getWrapped(s.roomId, "nobody")).ok).toBe(false);
  });

  it("takes one rating per player per match, only once the match is over", async () => {
    const s = await setup(3);
    await s.service.start(s.roomId, "s0");
    expect(await s.service.submitFeedback(s.roomId, "s1", { rating: 4 })).toEqual({
      ok: false,
      error: "game_not_finished",
    });
    for (let step = 1; step <= 5; step++) await playStep(s);
    await finishReveal(s);
    expect(await s.service.submitFeedback(s.roomId, "s1", { rating: 4, comment: "  So fun  " })).toEqual({
      ok: true,
      value: null,
    });
    await s.service.submitFeedback(s.roomId, "s1", { rating: 3 });
    const all = await s.store.listFeedback("2000-01-01T00:00:00Z", 10);
    expect(all).toEqual([expect.objectContaining({ game: "mutation_machine", rating: 3, comment: "So fun" })]);
  });
});

describe("Chain Reactions service: rules", () => {
  it("reports how long the step had been open when a job comes in", async () => {
    const s = await setup(3);
    await s.service.start(s.roomId, "s0");
    s.tick(42_400);
    const v = await view(s, s.players[1].id);
    const job = v.myJobs[0];
    const r = await s.service.submit(s.roomId, "s1", {
      step: 1,
      chain: job.chain,
      idempotencyKey: "k-seconds-1",
      artifact: drawingFor(job.chain, 1),
    });
    expect(r).toMatchObject({ ok: true, value: { duplicate: false, secondsTaken: 42 } });
  });

  it("only lets the host start, only in a Chain Reactions room", async () => {
    const s = await setup(3);
    expect(await s.service.start(s.roomId, "s1")).toEqual({ ok: false, error: "not_host" });
    const quick = await setup(3, "quick_party");
    expect(await quick.service.start(quick.roomId, "s0")).toEqual({ ok: false, error: "wrong_experience" });
    const alone = await setup(1);
    expect(await alone.service.start(alone.roomId, "s0")).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("refuses work that isn't yours, bad drawings and answers outside the choices", async () => {
    const s = await setup(4);
    await s.service.start(s.roomId, "s0");
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    const mine = match.plan.assignments.find((a) => a.step === 1 && a.playerId === s.players[0].id)!;
    const theirs = match.plan.assignments.find((a) => a.step === 1 && a.playerId !== s.players[0].id)!;
    const base = { step: 1, idempotencyKey: "abcdefgh1" };
    expect(
      await s.service.submit(s.roomId, "s0", { ...base, chain: theirs.chain, artifact: drawingFor(0, 1) }),
    ).toEqual({ ok: false, error: "not_assigned" });
    expect(
      await s.service.submit(s.roomId, "s0", {
        ...base,
        chain: mine.chain,
        artifact: { medium: "svg", svg: "<svg/>" },
      }),
    ).toEqual({ ok: false, error: "invalid_artifact" });
    expect(
      await s.service.submit(s.roomId, "s0", {
        ...base,
        step: 3,
        chain: mine.chain,
        answer: { mutationId: "mut-angry" },
      }),
    ).toEqual({ ok: false, error: "step_closed" });

    await playStep(s); // step 1
    await playStep(s); // step 2
    const v = await view(s, s.players[0].id);
    const detect = v.myJobs[0];
    if (detect.kind !== "detect") throw new Error("expected detect");
    const outsider = CHAOS_CONTENT.mutations.find((m) => !detect.mutationChoices.some((c) => c.id === m.id))!.id;
    expect(
      await s.service.submit(s.roomId, "s0", {
        step: 3,
        chain: detect.chain,
        idempotencyKey: "abcdefgh2",
        answer: { mutationId: outsider, objectId: detect.objectChoices![0].id },
      }),
    ).toEqual({ ok: false, error: "invalid_answer" });
  });

  it("lets the host skip waiting only after the timer, with placeholders and no points for missing work", async () => {
    const s = await setup(4);
    await s.service.start(s.roomId, "s0");
    const quiet = s.players[3].id;
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    // Everyone but the quiet player draws.
    for (const p of s.players.filter((x) => x.id !== quiet)) {
      const v = await view(s, p.id);
      for (const job of v.myJobs)
        await s.service.submit(s.roomId, s.hashOf.get(p.id)!, {
          step: 1,
          chain: job.chain,
          idempotencyKey: `q-${p.id}`,
          artifact: drawingFor(job.chain, 1),
        });
    }
    expect(
      await s.service.advance(s.roomId, "s0", { stateVersion: match.stateVersion, action: "skip_waiting" }),
    ).toEqual({ ok: false, error: "not_ready" });
    s.tick(61_000);
    expect(
      await s.service.advance(s.roomId, "s0", { stateVersion: match.stateVersion, action: "skip_waiting" }),
    ).toMatchObject({ ok: true });
    // The quiet player's chain shows as skipped to whoever mutates it.
    const quietChain = match.plan.assignments.find((a) => a.step === 1 && a.playerId === quiet)!.chain;
    const mutator = match.plan.assignments.find((a) => a.step === 2 && a.chain === quietChain)!.playerId;
    const job = (await view(s, mutator)).myJobs.find((j) => j.chain === quietChain);
    expect(job?.kind === "mutate" && job.base[0].artifact).toBeNull();
  });

  it("doesn't wait for a player who left", async () => {
    const s = await setup(4);
    await s.service.start(s.roomId, "s0");
    const leaver = s.players[2];
    for (const p of s.players.filter((x) => x.id !== leaver.id)) {
      const v = await view(s, p.id);
      for (const job of v.myJobs)
        await s.service.submit(s.roomId, s.hashOf.get(p.id)!, {
          step: 1,
          chain: job.chain,
          idempotencyKey: `l-${p.id}`,
          artifact: drawingFor(job.chain, 1),
        });
    }
    expect((await s.store.getLatestChainMatch(s.roomId))!.step).toBe(1);
    await s.store.removePlayer(leaver.id);
    expect(await s.service.afterRosterChange(s.roomId)).toBe(true);
    expect((await s.store.getLatestChainMatch(s.roomId))!.step).toBe(2);
  });

  it("moves on by itself once a step's overtime is up, even if the host never skips", async () => {
    const s = await setup(3);
    await s.service.start(s.roomId, "s0");
    const catchUp = async () =>
      s.service.catchUp((await s.store.getRoomById(s.roomId))!, await s.store.listPlayers(s.roomId));
    const step = async () => (await s.store.getLatestChainMatch(s.roomId))!.step;

    // Nobody submits. During the timer and the overtime, nothing moves.
    s.tick(60_000);
    expect(await catchUp()).toBe(false);
    s.tick(19_000);
    expect(await catchUp()).toBe(false);
    const v = await view(s, s.players[1].id);
    expect(new Date(v.step!.autoSkipAt).getTime() - new Date(v.step!.deadline).getTime()).toBe(20_000);

    // Overtime up: the first refresh moves it, a racing second one is a no-op.
    s.tick(1_000);
    const [a, b] = await Promise.all([catchUp(), catchUp()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await step()).toBe(2);
    // The new step has its own full timer.
    expect(await catchUp()).toBe(false);

    // Through to the reveal; nothing auto-moves there (the host or a handed-over host leads it).
    for (let i = 2; i <= 5; i++) {
      s.tick(80_000);
      expect(await catchUp()).toBe(true);
    }
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    expect(match.phase).toBe("REVEAL");
    s.tick(600_000);
    expect(await catchUp()).toBe(false);
    // Skipped detect steps score nothing, but nothing breaks either.
    expect(await s.store.listChainScores(match.id)).toEqual([]);
  });

  it("never auto-moves a Quick Party room", async () => {
    const s = await setup(3, "quick_party");
    s.tick(600_000);
    expect(await s.service.catchUp((await s.store.getRoomById(s.roomId))!, await s.store.listPlayers(s.roomId))).toBe(
      false,
    );
  });
});

describe("Chain Reactions: what each phone can see (leak tests)", () => {
  it("shows every player only their own jobs, never other chains, cards or answers before the reveal", async () => {
    const s = await setup(6);
    await s.service.start(s.roomId, "s0");
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    const hints = CHAOS_CONTENT.mutations.map((m) => m.drawHint);
    for (let step = 1; step <= 5; step++) {
      for (const p of s.players) {
        const v = await view(s, p.id);
        const json = JSON.stringify(v);
        const mine = match.plan.assignments.filter((a) => a.step === step && a.playerId === p.id);
        expect(v.myJobs.map((j) => j.chain).sort()).toEqual(mine.map((a) => a.chain).sort());
        expect(v.reveals).toEqual([]);
        expect(v.recap).toBeNull();
        // Only your own mutation card's drawing hint, and only in a mutate step.
        const myHints = v.myJobs.flatMap((j) => (j.kind === "mutate" ? [j.mutation.drawHint] : []));
        for (const h of hints) expect(json.includes(h), `${p.id} step ${step}`).toBe(myHints.includes(h));
        // Drawings from chains you aren't working on right now never appear.
        for (let chain = 0; chain < 6; chain++) {
          for (const drawnAt of [1, 2, 4]) {
            const visible = json.includes(markerText(chain, drawnAt));
            const allowed = mine.some((a) => a.chain === chain) && drawnAt < step;
            expect(visible, `${p.id} sees chain ${chain} step ${drawnAt} at step ${step}`).toBe(allowed);
          }
        }
        // Nobody's answers, including whether anyone was right.
        expect(json).not.toMatch(/Right"/);
      }
      await playStep(s, (playerId) => playerId !== s.players[1].id);
    }
    // In the reveal, chains appear one at a time.
    const v = await view(s, s.players[4].id);
    expect(v.phase).toBe("REVEAL");
    expect(v.reveals.map((r) => r.chain)).toEqual([0]);
  });
});
