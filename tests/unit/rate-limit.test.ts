import { describe, expect, it } from "vitest";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const key = `test-${Math.random()}`;
    const { max } = LIMITS.createRoom;
    for (let i = 0; i < max; i++) expect(rateLimit("createRoom", key, 1_000)).toBe(true);
    expect(rateLimit("createRoom", key, 1_000)).toBe(false);
  });

  it("resets after the window", () => {
    const key = `test-${Math.random()}`;
    const { max, windowMs } = LIMITS.createRoom;
    for (let i = 0; i <= max; i++) rateLimit("createRoom", key, 1_000);
    expect(rateLimit("createRoom", key, 1_000 + windowMs)).toBe(true);
  });

  it("counts each player separately even on one shared IP", () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
    const { max } = LIMITS.roomState;
    for (let i = 0; i < max; i++) rateLimit("roomState", `${ip}:player-a`, 1_000);
    expect(rateLimit("roomState", `${ip}:player-a`, 1_000)).toBe(false);
    expect(rateLimit("roomState", `${ip}:player-b`, 1_000)).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
