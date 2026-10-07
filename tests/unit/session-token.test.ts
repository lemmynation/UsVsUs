import { describe, expect, it } from "vitest";
import { analyticsIdFromHash, generateSessionToken, hashSessionToken, isValidSessionToken } from "@/lib/session-token";

describe("session tokens", () => {
  it("generates unique, well-formed tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(isValidSessionToken(a)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(isValidSessionToken(undefined)).toBe(false);
    expect(isValidSessionToken("short")).toBe(false);
    expect(isValidSessionToken("x".repeat(42) + "!")).toBe(false);
  });

  it("hashes deterministically without exposing the token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("derives a short analytics id that differs from the stored hash", () => {
    const hash = hashSessionToken(generateSessionToken());
    const id = analyticsIdFromHash(hash);
    expect(id).toHaveLength(16);
    expect(hash).not.toContain(id);
  });
});
