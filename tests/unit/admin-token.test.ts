import { describe, expect, it } from "vitest";
import { adminCookieValue, isCorrectAdminToken, isValidAdminCookie, usableAdminToken } from "@/lib/admin-token";

const TOKEN = "correct-horse-battery-staple";

describe("admin token", () => {
  it("is off when missing, blank or too short", () => {
    expect(usableAdminToken(undefined)).toBeNull();
    expect(usableAdminToken("   ")).toBeNull();
    expect(usableAdminToken("short")).toBeNull();
    expect(usableAdminToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("accepts only the exact token", () => {
    expect(isCorrectAdminToken(TOKEN, TOKEN)).toBe(true);
    expect(isCorrectAdminToken(TOKEN, `${TOKEN} `)).toBe(false);
    expect(isCorrectAdminToken(TOKEN, "")).toBe(false);
  });

  it("puts a derived value in the cookie, not the token, and checks it", () => {
    const cookie = adminCookieValue(TOKEN);
    expect(cookie).not.toContain(TOKEN);
    expect(isValidAdminCookie(TOKEN, cookie)).toBe(true);
    expect(isValidAdminCookie(TOKEN, undefined)).toBe(false);
    expect(isValidAdminCookie(TOKEN, TOKEN)).toBe(false);
    // Changing the token logs out existing cookies.
    expect(isValidAdminCookie("a-different-long-token", cookie)).toBe(false);
  });
});
