import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import { planMatch } from "@/lib/chaos/plan";
import {
  decideAdvance,
  firstPosition,
  jobKey,
  jobsFor,
  nextPosition,
  stepDeadline,
  type ChaosPosition,
} from "@/lib/chaos/state-machine";

const ids = ["a", "b", "c", "d"];
const plan = planMatch({ playerIds: ids, content: CHAOS_CONTENT, seed: 99 });
const everyone = new Set(ids);

describe("Mutation Machine flow", () => {
  it("walks every step, then every chain's reveal, then the recap", () => {
    const seen: string[] = [];
    let pos: ChaosPosition = firstPosition();
    for (let i = 0; i < 20 && pos.phase !== "RECAP"; i++) {
      seen.push(pos.phase === "STEP_OPEN" ? `step${pos.step}` : `reveal${pos.revealChain}`);
      pos = nextPosition(pos, plan);
    }
    expect(seen).toEqual(["step1", "step2", "step3", "step4", "step5", "reveal0", "reveal1", "reveal2", "reveal3"]);
    expect(pos.phase).toBe("RECAP");
    expect(nextPosition(pos, plan).phase).toBe("RECAP"); // stays put
  });

  it("moves on by itself only when every job in the step is in", () => {
    const jobs = jobsFor(plan, 1, everyone);
    const some = new Set(jobs.slice(0, 3).map(jobKey));
    const all = new Set(jobs.map(jobKey));
    const base = { plan, position: firstPosition(), activePlayerIds: everyone, deadlinePassed: false };
    expect(decideAdvance({ ...base, action: "auto", done: some })).toEqual({ ok: false, error: "not_ready" });
    expect(decideAdvance({ ...base, action: "auto", done: all })).toMatchObject({ ok: true, next: { step: 2 } });
  });

  it("lets the host skip waiting only after the timer (or once everyone's in)", () => {
    const base = { plan, position: firstPosition(), activePlayerIds: everyone, done: new Set<string>() };
    expect(decideAdvance({ ...base, action: "skip_waiting", deadlinePassed: false })).toEqual({
      ok: false,
      error: "not_ready",
    });
    expect(decideAdvance({ ...base, action: "skip_waiting", deadlinePassed: true })).toMatchObject({ ok: true });
  });

  it("stops waiting for players who left", () => {
    const stillHere = new Set(["a", "b", "c"]);
    const done = new Set(jobsFor(plan, 1, stillHere).map(jobKey));
    expect(jobsFor(plan, 1, stillHere)).toHaveLength(3);
    expect(
      decideAdvance({
        plan,
        position: firstPosition(),
        action: "auto",
        activePlayerIds: stillHere,
        done,
        deadlinePassed: false,
      }),
    ).toMatchObject({ ok: true });
  });

  it("only reveal actions work during the reveal, and steps can't be skipped from it", () => {
    const reveal: ChaosPosition = { phase: "REVEAL", step: 5, revealChain: 1 };
    const base = { plan, position: reveal, activePlayerIds: everyone, done: new Set<string>(), deadlinePassed: true };
    expect(decideAdvance({ ...base, action: "reveal_next" })).toMatchObject({ ok: true, next: { revealChain: 2 } });
    expect(decideAdvance({ ...base, action: "finish" })).toMatchObject({ ok: true, next: { phase: "RECAP" } });
    expect(decideAdvance({ ...base, action: "skip_waiting" })).toEqual({ ok: false, error: "not_open" });
  });

  it("gives each step its own timer", () => {
    const opened = new Date("2026-10-12T10:00:00Z");
    expect(stepDeadline(plan, 1, opened).toISOString()).toBe("2026-10-12T10:01:00.000Z");
    expect(stepDeadline(plan, 2, opened).toISOString()).toBe("2026-10-12T10:00:40.000Z");
  });
});
