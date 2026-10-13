import { describe, expect, it } from "vitest";
import { CHAOS_CONTENT } from "@/lib/chaos/content";
import type { ChaosPlayerView } from "@/lib/chaos/projections";
import { createChaosService } from "@/lib/chaos/service";
import { hashPairingCode, MAX_DISPLAYS_PER_ROOM, PAIRING_CODE_TTL_MS } from "@/lib/party/pairing";
import { createPartyService } from "@/lib/party/service";
import { JOIN_CODE_ALPHABET } from "@/lib/rooms/rules";
import { MemoryRoomStore } from "@/lib/rooms/memory-store";
import { hashSessionToken } from "@/lib/session-token";
import type { SpectatorState } from "@/types/party";
import type { Experience } from "@/types/room";

const NAMES = ["Lem", "Ana", "Ben", "Cy", "Dee", "Eli"];

async function setup(n = 3, experience: Experience = "chain_reactions") {
  const store = new MemoryRoomStore();
  let clock = new Date("2026-10-14T10:00:00Z");
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = () => clock;
  const party = createPartyService({
    store,
    content: CHAOS_CONTENT,
    now,
    randomInt: (max) => Math.floor(random() * max),
  });
  const chaos = createChaosService({ store, content: CHAOS_CONTENT, now, random });
  const created = await store.createRoom({
    joinCode: "TVR234",
    mode: n === 2 ? "couple" : "circle",
    name: "Game night",
    expiresAt: "2026-10-15T10:00:00Z",
    now: clock.toISOString(),
    host: { nickname: NAMES[0], sessionTokenHash: "s0" },
    experience,
  });
  if (created === "join_code_taken") throw new Error("taken");
  for (let i = 1; i < n; i++) {
    await store.addPlayer({
      roomId: created.room.id,
      nickname: NAMES[i],
      sessionTokenHash: `s${i}`,
      maxPlayers: 10,
      now: new Date(clock.getTime() + i * 1000).toISOString(),
    });
  }
  const roomId = created.room.id;
  /** A TV asks for a code; returns it with the TV's cookie hash. */
  const tv = async () => {
    const r = await party.request();
    if (!r.ok) throw new Error(r.error);
    return { code: r.value.code, hash: hashSessionToken(r.value.token), expiresAt: r.value.expiresAt };
  };
  return { store, party, chaos, roomId, tv, tick: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const paired = (state: SpectatorState) => {
  if (state.status !== "paired") throw new Error(`expected paired, got ${state.status}`);
  return state.view;
};

describe("Party Screen: pairing", () => {
  it("gives a TV a 6-character code and stores only hashes", async () => {
    const s = await setup();
    const { code, hash, expiresAt } = await s.tv();
    expect(code).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]{6}$`));
    expect(new Date(expiresAt).getTime() - new Date("2026-10-14T10:00:00Z").getTime()).toBe(PAIRING_CODE_TTL_MS);
    const display = (await s.store.getDisplayByToken(hash))!;
    expect(display.status).toBe("pending");
    expect(JSON.stringify(display)).not.toContain(code);
    expect(display.pairingCodeHash).toBe(hashPairingCode(code));
    expect(await s.party.spectate(hash)).toEqual({ status: "pending", expiresAt });
  });

  it("picks another code when the first one is on another TV right now", async () => {
    const s = await setup();
    const first = await s.tv();
    // Same randomness again: the first code it draws is taken.
    const replay = first.code.split("").map((ch) => JOIN_CODE_ALPHABET.indexOf(ch));
    let i = 0;
    const party = createPartyService({
      store: s.store,
      content: CHAOS_CONTENT,
      now: () => new Date("2026-10-14T10:00:00Z"),
      randomInt: (max) => (i < replay.length ? replay[i++] : (i++ * 7) % max),
    });
    const second = await party.request();
    expect(second.ok && second.value.code).not.toBe(first.code);
  });

  it("lets only the host pair, with any spacing or case", async () => {
    const s = await setup();
    const { code, hash } = await s.tv();
    expect(await s.party.pair(s.roomId, "s1", code)).toEqual({ ok: false, error: "not_host" });
    expect(await s.party.pair(s.roomId, "stranger", code)).toEqual({ ok: false, error: "not_in_room" });
    const spaced = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
    expect((await s.party.pair(s.roomId, "s0", spaced)).ok).toBe(true);
    expect(paired(await s.party.spectate(hash)).room.joinCode).toBe("TVR234");
  });

  it("refuses wrong, malformed, expired and already-used codes", async () => {
    const s = await setup();
    const bad = { ok: false, error: "invalid_pairing_code" };
    expect(await s.party.pair(s.roomId, "s0", "nope")).toEqual(bad);
    expect(await s.party.pair(s.roomId, "s0", "ZZZZZZ")).toEqual(bad);

    const used = await s.tv();
    expect((await s.party.pair(s.roomId, "s0", used.code)).ok).toBe(true);
    expect(await s.party.pair(s.roomId, "s0", used.code)).toEqual(bad); // single use

    const late = await s.tv();
    s.tick(PAIRING_CODE_TTL_MS + 1);
    expect(await s.party.pair(s.roomId, "s0", late.code)).toEqual(bad);
    expect(await s.party.spectate(late.hash)).toEqual({ status: "unpaired", reason: "expired" });
  });

  it(`allows ${MAX_DISPLAYS_PER_ROOM} TVs per room; disconnecting one frees a slot`, async () => {
    const s = await setup();
    const tvs = [await s.tv(), await s.tv(), await s.tv()];
    expect((await s.party.pair(s.roomId, "s0", tvs[0].code)).ok).toBe(true);
    expect((await s.party.pair(s.roomId, "s0", tvs[1].code)).ok).toBe(true);
    expect(await s.party.pair(s.roomId, "s0", tvs[2].code)).toEqual({ ok: false, error: "too_many_displays" });

    const list = await s.party.list(s.roomId, "s0");
    expect(list.ok && list.value.map((d) => d.label)).toEqual(["TV 1", "TV 2"]);
    const first = list.ok ? list.value[0].id : "";
    expect(await s.party.revoke(s.roomId, "s1", first)).toEqual({ ok: false, error: "not_host" });
    expect(await s.party.revoke(s.roomId, "s0", first)).toEqual({ ok: true, value: null });
    expect(await s.party.revoke(s.roomId, "s0", first)).toEqual({ ok: false, error: "display_not_found" });
    expect(await s.party.spectate(tvs[0].hash)).toEqual({ status: "unpaired", reason: "revoked" });
    expect((await s.party.pair(s.roomId, "s0", tvs[2].code)).ok).toBe(true);
  });

  it("can't revoke another room's TV", async () => {
    const s = await setup();
    const other = await s.store.createRoom({
      joinCode: "OTH234",
      mode: "circle",
      name: null,
      expiresAt: "2026-10-15T10:00:00Z",
      now: "2026-10-14T10:00:00Z",
      host: { nickname: "Zed", sessionTokenHash: "z0" },
      experience: "chain_reactions",
    });
    if (other === "join_code_taken") throw new Error("taken");
    const theirs = await s.tv();
    const r = await s.party.pair(other.room.id, "z0", theirs.code);
    expect(r.ok).toBe(true);
    expect(await s.party.revoke(s.roomId, "s0", r.ok ? r.value.displayId : "")).toEqual({
      ok: false,
      error: "display_not_found",
    });
  });

  it("only pairs Mutation Machine rooms that are still live", async () => {
    const quiz = await setup(3, "quick_party");
    expect(await quiz.party.pair(quiz.roomId, "s0", (await quiz.tv()).code)).toEqual({
      ok: false,
      error: "wrong_experience",
    });

    const s = await setup();
    const { code, hash } = await s.tv();
    expect((await s.party.pair(s.roomId, "s0", code)).ok).toBe(true);
    s.store._setExpiresAt(s.roomId, "2026-10-14T09:00:00Z");
    expect(await s.party.spectate(hash)).toEqual({ status: "ended" });
    expect(await s.party.pair(s.roomId, "s0", (await s.tv()).code)).toEqual({ ok: false, error: "room_closed" });
  });

  it("shows the host which TVs are still there", async () => {
    const s = await setup();
    const { code, hash } = await s.tv();
    await s.party.pair(s.roomId, "s0", code);
    const status = async () => {
      const r = await s.party.list(s.roomId, "s0");
      return r.ok && r.value[0].status;
    };
    expect(await status()).toBe("connecting"); // paired, hasn't loaded yet
    await s.party.spectate(hash);
    expect(await status()).toBe("showing");
    s.tick(60_000);
    expect(await status()).toBe("away");
  });

  it("unknown cookies are just a new TV", async () => {
    const s = await setup();
    expect(await s.party.spectate(null)).toEqual({ status: "unpaired", reason: "new" });
    expect(await s.party.spectate("f".repeat(64))).toEqual({ status: "unpaired", reason: "new" });
  });

  it("cleanup removes unused codes after a day and TVs with their room", async () => {
    const s = await setup();
    const unused = await s.tv();
    const kept = await s.tv();
    await s.party.pair(s.roomId, "s0", kept.code);
    const realNow = Date.now;
    // The memory store reads the real clock for "a day old"; the test's codes are from 2026-10-14.
    Date.now = () => new Date("2026-10-16T00:00:00Z").getTime();
    try {
      await s.store.cleanupExpiredData({
        rooms: "2000-01-01T00:00:00Z",
        questionHistory: "2000-01-01T00:00:00Z",
        events: "2000-01-01T00:00:00Z",
        paymentEvents: "2000-01-01T00:00:00Z",
        feedback: "2000-01-01T00:00:00Z",
      });
    } finally {
      Date.now = realNow;
    }
    expect(await s.store.getDisplayByToken(kept.hash)).not.toBeNull();
    expect(await s.store.getDisplayByToken(unused.hash)).toBeNull();
    await s.store.cleanupExpiredData({
      rooms: "2030-01-01T00:00:00Z",
      questionHistory: "2000-01-01T00:00:00Z",
      events: "2000-01-01T00:00:00Z",
      paymentEvents: "2000-01-01T00:00:00Z",
      feedback: "2000-01-01T00:00:00Z",
    });
    expect(await s.store.getDisplayByToken(kept.hash)).toBeNull();
  });
});

// ── What the TV may see ───────────────────────────────────────────────────────

/** A drawing with a marker stroke unique to (chain, step), so leaks are detectable. */
const marker = (chain: number, step: number) => `"p":[${7 + chain},${500 + step}`;
const drawingFor = (chain: number, step: number) => ({
  medium: "drawing",
  strokes: [{ c: 0, w: 1, p: [7 + chain, 500 + step, 300, 300] }],
});

async function playerView(s: Setup, hash: string): Promise<ChaosPlayerView> {
  const room = (await s.store.getRoomById(s.roomId))!;
  const players = await s.store.listPlayers(s.roomId);
  return (await s.chaos.viewFor(
    room,
    players,
    players.find((p) => p.sessionTokenHash === hash)!,
  ))!;
}

/** Everyone does their jobs for the open step (detectives pick the first choice). */
async function playStep(s: Setup, hashes: string[]) {
  for (const hash of hashes) {
    const v = await playerView(s, hash);
    for (const job of v.myJobs) {
      const base = { step: v.step!.index, chain: job.chain, idempotencyKey: `k-${hash}-${v.step!.index}-${job.chain}` };
      const r =
        job.kind === "detect"
          ? await s.chaos.submit(s.roomId, hash, {
              ...base,
              answer: {
                mutationId: job.mutationChoices[0].id,
                ...(job.objectChoices ? { objectId: job.objectChoices[0].id } : {}),
              },
            })
          : await s.chaos.submit(s.roomId, hash, { ...base, artifact: drawingFor(job.chain, v.step!.index) });
      expect(r.ok).toBe(true);
    }
  }
}

describe("Party Screen: what the TV can see (leak tests)", () => {
  it("never shows assignments, cards, drawings or answers before the reveal reaches them", async () => {
    const s = await setup(6);
    const hashes = NAMES.map((_, i) => `s${i}`);
    const { code, hash } = await s.tv();
    await s.party.pair(s.roomId, "s0", code);

    const lobby = paired(await s.party.spectate(hash));
    expect(lobby.chaos).toBeNull();
    expect(lobby.players.map((p) => p.nickname)).toEqual(NAMES);

    await s.chaos.start(s.roomId, "s0");
    const match = (await s.store.getLatestChainMatch(s.roomId))!;
    const cardLabels = [...CHAOS_CONTENT.objects, ...CHAOS_CONTENT.mutations].map((c) => c.label);
    const hints = CHAOS_CONTENT.mutations.map((m) => m.drawHint);

    for (let step = 1; step <= 5; step++) {
      const half = hashes.slice(0, 3);
      await playStep(s, half);
      const view = paired(await s.party.spectate(hash));
      const json = JSON.stringify(view);
      expect(view.chaos?.phase).toBe("STEP_OPEN");
      expect(view.chaos?.step?.index).toBe(step);
      const working = new Set(match.plan.assignments.filter((a) => a.step === step).map((a) => a.playerId));
      const players = await s.store.listPlayers(s.roomId);
      const done = players.filter((p) => half.includes(p.sessionTokenHash) && working.has(p.id)).length;
      expect(view.chaos?.progress).toEqual({ done, total: working.size });
      // No per-player fields at all, and nothing anyone was given or made.
      expect(json).not.toMatch(/myJobs|waitingOn|"mine"|"base"|"layers"|Choices|Right"/);
      for (const h of hints) expect(json).not.toContain(h);
      for (const label of cardLabels) expect(json).not.toContain(`"${label}"`);
      for (let chain = 0; chain < 6; chain++) for (const at of [1, 2, 4]) expect(json).not.toContain(marker(chain, at));
      // Nobody's session, cookie or code.
      expect(json).not.toMatch(/sessionTokenHash|tokenHash|pairingCode|"s[0-5]"/);
      expect(json).not.toContain(code);
      await playStep(s, hashes.slice(3));
    }

    // The reveal: one chain at a time, and only the chain on screen.
    const host = "s0";
    for (let chain = 0; chain < 6; chain++) {
      const view = paired(await s.party.spectate(hash));
      expect(view.chaos?.phase).toBe("REVEAL");
      expect(view.chaos?.reveal?.chain).toBe(chain);
      const json = JSON.stringify(view);
      expect(json).toContain(marker(chain, 1));
      for (let other = 0; other < 6; other++) {
        if (other !== chain) expect(json, `chain ${other} while showing ${chain}`).not.toContain(marker(other, 1));
      }
      expect(view.chaos?.reveal?.object.id).toBe(match.plan.chains[chain].objectId);
      const m = (await s.store.getLatestChainMatch(s.roomId))!;
      expect((await s.chaos.advance(s.roomId, host, { stateVersion: m.stateVersion, action: "reveal_next" })).ok).toBe(
        true,
      );
    }

    const recap = paired(await s.party.spectate(hash));
    expect(recap.chaos?.phase).toBe("RECAP");
    expect(Object.keys(recap.chaos?.recap?.titles ?? {})).toHaveLength(6);
    expect(recap.chaos?.reveal).toBeNull();
  });

  it("a rematch puts the TV back on the lobby, still paired", async () => {
    const s = await setup(2);
    const { code, hash } = await s.tv();
    await s.party.pair(s.roomId, "s0", code);
    await s.chaos.start(s.roomId, "s0");
    for (let step = 1; step <= 5; step++) await playStep(s, ["s0", "s1"]);
    const m = (await s.store.getLatestChainMatch(s.roomId))!;
    await s.chaos.advance(s.roomId, "s0", { stateVersion: m.stateVersion, action: "finish" });
    expect(paired(await s.party.spectate(hash)).chaos?.phase).toBe("RECAP");
    await s.store.reopenRoom({ roomId: s.roomId, expiresAt: "2026-10-15T12:00:00Z" });
    const view = paired(await s.party.spectate(hash));
    expect(view.room.status).toBe("LOBBY");
    expect(view.chaos).toBeNull();
  });
});
