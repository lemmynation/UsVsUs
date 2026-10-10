import { describe, expect, it } from "vitest";
import {
  checkCanJoin,
  checkCanRematch,
  checkCanKick,
  checkCanStart,
  computeExpiresAt,
  effectiveStatus,
  generateJoinCode,
  isOnline,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  MODE_RULES,
  nextHost,
  normalizeJoinCode,
  ROOM_TTL_MS,
  IN_GAME_GRACE_MS,
  sanitizeNickname,
  sanitizeRoomName,
} from "@/lib/rooms/rules";
import type { Mode, Player, Room } from "@/types/room";

const NOW = new Date("2026-10-07T12:00:00Z");

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    joinCode: "ABC234",
    mode: "couple",
    name: null,
    hostPlayerId: "p1",
    status: "LOBBY",
    selectedPackId: null,
    createdAt: NOW.toISOString(),
    expiresAt: computeExpiresAt(NOW),
    ...overrides,
  };
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    roomId: "room-1",
    nickname: id,
    sessionTokenHash: `hash-${id}`,
    isHost: false,
    status: "active",
    joinedAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

const host = () => player("p1", { isHost: true });

describe("mode rules", () => {
  it.each<[Mode, number, number]>([
    ["couple", 2, 2],
    ["friends", 2, 2],
    ["circle", 3, 10],
  ])("%s allows %i–%i players", (mode, min, max) => {
    expect(MODE_RULES[mode]).toEqual({ minPlayers: min, maxPlayers: max });
  });
});

describe("join codes", () => {
  it("generates codes from the unambiguous alphabet", () => {
    let i = 0;
    const code = generateJoinCode((max) => i++ % max);
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch);
  });

  it("never uses look-alike characters", () => {
    for (const ch of "01ILO") expect(JOIN_CODE_ALPHABET).not.toContain(ch);
  });

  it("normalizes case, spaces and dashes", () => {
    expect(normalizeJoinCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeJoinCode("abc 234")).toBe("ABC234");
  });

  it("rejects wrong length or ambiguous characters", () => {
    expect(normalizeJoinCode("ABC23")).toBeNull();
    expect(normalizeJoinCode("ABC2345")).toBeNull();
    expect(normalizeJoinCode("ABC0O1")).toBeNull();
    expect(normalizeJoinCode("")).toBeNull();
  });
});

describe("sanitizeNickname", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeNickname("  Lem   A  ")).toEqual({ ok: true, value: "Lem A" });
  });

  it("strips control and zero-width characters", () => {
    expect(sanitizeNickname("Le​m\u0007")).toEqual({ ok: true, value: "Lem" });
  });

  it("strips bidi overrides that could disguise a name", () => {
    expect(sanitizeNickname("‮meL")).toEqual({ ok: true, value: "meL" });
  });

  it("keeps joined emoji intact", () => {
    const couple = "\u{1F469}‍❤️‍\u{1F468}";
    expect(sanitizeNickname(`Us ${couple}`)).toEqual({ ok: true, value: `Us ${couple}` });
  });

  it("requires a non-empty name", () => {
    expect(sanitizeNickname("   ")).toEqual({ ok: false, error: "nickname_required" });
    expect(sanitizeNickname("​")).toEqual({ ok: false, error: "nickname_required" });
  });

  it("limits length to 20 characters, counting emoji as one", () => {
    expect(sanitizeNickname("a".repeat(20)).ok).toBe(true);
    expect(sanitizeNickname("a".repeat(21))).toEqual({ ok: false, error: "nickname_too_long" });
    expect(sanitizeNickname("😀".repeat(20)).ok).toBe(true);
  });
});

describe("sanitizeRoomName", () => {
  it("treats blank as no name", () => {
    expect(sanitizeRoomName("   ")).toEqual({ ok: true, value: null });
    expect(sanitizeRoomName(undefined)).toEqual({ ok: true, value: null });
  });

  it("limits length to 40 characters", () => {
    expect(sanitizeRoomName("x".repeat(41))).toEqual({ ok: false, error: "room_name_too_long" });
  });
});

describe("expiry", () => {
  it("expires rooms 24 hours after creation", () => {
    expect(new Date(computeExpiresAt(NOW)).getTime() - NOW.getTime()).toBe(ROOM_TTL_MS);
  });

  it("reads open rooms past expiry as EXPIRED", () => {
    const r = room();
    expect(effectiveStatus(r, NOW)).toBe("LOBBY");
    expect(effectiveStatus(r, new Date(NOW.getTime() + ROOM_TTL_MS))).toBe("EXPIRED");
  });

  it("lets a game that is already running finish past the deadline, within a grace period", () => {
    const r = room({ status: "IN_GAME" });
    const deadline = new Date(r.expiresAt).getTime();
    expect(effectiveStatus(r, new Date(deadline + 60_000))).toBe("IN_GAME");
    expect(effectiveStatus(r, new Date(deadline + IN_GAME_GRACE_MS))).toBe("EXPIRED");
    // A lobby gets no grace: nobody can start a game in an expired room.
    expect(effectiveStatus(room(), new Date(deadline + 60_000))).toBe("EXPIRED");
  });

  it("leaves finished rooms alone", () => {
    expect(effectiveStatus(room({ status: "COMPLETED" }), new Date(NOW.getTime() + 2 * ROOM_TTL_MS))).toBe("COMPLETED");
  });
});

describe("checkCanJoin", () => {
  it("allows joining an open lobby with space", () => {
    expect(checkCanJoin(room(), [host()], "Ana", "hash-new", NOW)).toEqual({ ok: true, value: null });
  });

  it("rejects a full couple room", () => {
    expect(checkCanJoin(room(), [host(), player("p2")], "Ana", "hash-new", NOW)).toEqual({
      ok: false,
      error: "room_full",
    });
  });

  it("does not count kicked players toward capacity", () => {
    const players = [host(), player("p2", { status: "kicked" })];
    expect(checkCanJoin(room(), players, "Ana", "hash-new", NOW).ok).toBe(true);
  });

  it("allows up to 10 in circle mode", () => {
    const players = [host(), ...Array.from({ length: 8 }, (_, i) => player(`x${i}`))];
    const circle = room({ mode: "circle" });
    expect(checkCanJoin(circle, players, "Ana", "hash-new", NOW).ok).toBe(true);
    expect(checkCanJoin(circle, [...players, player("x9")], "Ana", "hash-new", NOW)).toEqual({
      ok: false,
      error: "room_full",
    });
  });

  it("rejects duplicate nicknames case-insensitively", () => {
    const players = [host()];
    expect(checkCanJoin(room({ mode: "circle" }), players, "P1", "hash-new", NOW)).toEqual({
      ok: false,
      error: "nickname_taken",
    });
  });

  it("rejects started, expired and closed rooms", () => {
    expect(checkCanJoin(room({ status: "IN_GAME" }), [host()], "Ana", "h", NOW)).toEqual({
      ok: false,
      error: "room_in_progress",
    });
    expect(checkCanJoin(room({ expiresAt: NOW.toISOString() }), [host()], "Ana", "h", NOW)).toEqual({
      ok: false,
      error: "room_expired",
    });
    expect(checkCanJoin(room({ status: "ABANDONED" }), [host()], "Ana", "h", NOW)).toEqual({
      ok: false,
      error: "room_closed",
    });
  });

  it("blocks a kicked session from rejoining", () => {
    const players = [host(), player("p2", { status: "kicked" })];
    expect(checkCanJoin(room(), players, "New name", "hash-p2", NOW)).toEqual({ ok: false, error: "kicked" });
  });
});

describe("checkCanStart", () => {
  it("lets the host start once the minimum is reached", () => {
    expect(checkCanStart(room(), [host(), player("p2")], host(), NOW)).toEqual({ ok: true, value: null });
  });

  it("blocks starting below the minimum", () => {
    expect(checkCanStart(room(), [host()], host(), NOW)).toEqual({ ok: false, error: "not_enough_players" });
    const circle = room({ mode: "circle" });
    expect(checkCanStart(circle, [host(), player("p2")], host(), NOW)).toEqual({
      ok: false,
      error: "not_enough_players",
    });
    expect(checkCanStart(circle, [host(), player("p2"), player("p3")], host(), NOW).ok).toBe(true);
  });

  it("ignores kicked players when counting", () => {
    expect(checkCanStart(room(), [host(), player("p2", { status: "kicked" })], host(), NOW)).toEqual({
      ok: false,
      error: "not_enough_players",
    });
  });

  it("only allows the host", () => {
    const guest = player("p2");
    expect(checkCanStart(room(), [host(), guest], guest, NOW)).toEqual({ ok: false, error: "not_host" });
  });

  it("can't start twice or after expiry", () => {
    expect(checkCanStart(room({ status: "IN_GAME" }), [host(), player("p2")], host(), NOW)).toEqual({
      ok: false,
      error: "not_in_lobby",
    });
    expect(checkCanStart(room({ expiresAt: NOW.toISOString() }), [host(), player("p2")], host(), NOW)).toEqual({
      ok: false,
      error: "room_expired",
    });
  });
});

describe("checkCanKick", () => {
  it("lets the host remove another player", () => {
    expect(checkCanKick(room(), host(), player("p2"), NOW)).toEqual({ ok: true, value: null });
  });

  it("rejects non-hosts, self-kicks and unknown players", () => {
    expect(checkCanKick(room(), player("p2"), host(), NOW)).toEqual({ ok: false, error: "not_host" });
    expect(checkCanKick(room(), host(), host(), NOW)).toEqual({ ok: false, error: "cannot_kick_self" });
    expect(checkCanKick(room(), host(), undefined, NOW)).toEqual({ ok: false, error: "player_not_found" });
    expect(checkCanKick(room(), host(), player("p2", { roomId: "other" }), NOW)).toEqual({
      ok: false,
      error: "player_not_found",
    });
  });
});

describe("nextHost", () => {
  it("picks the earliest-joined remaining active player", () => {
    const players = [
      host(),
      player("late", { joinedAt: "2026-10-07T12:05:00Z" }),
      player("early", { joinedAt: "2026-10-07T12:01:00Z" }),
      player("gone", { joinedAt: "2026-10-07T12:00:30Z", status: "kicked" }),
    ];
    expect(nextHost(players, "p1")?.id).toBe("early");
  });

  it("returns null when nobody is left", () => {
    expect(nextHost([host()], "p1")).toBeNull();
  });
});

describe("isOnline", () => {
  it("treats players seen in the last 20 seconds as here", () => {
    expect(isOnline(player("p", { lastSeenAt: new Date(NOW.getTime() - 19_000).toISOString() }), NOW)).toBe(true);
    expect(isOnline(player("p", { lastSeenAt: new Date(NOW.getTime() - 21_000).toISOString() }), NOW)).toBe(false);
  });
});

describe("rematch", () => {
  it("is for the host, after a game, and fine to repeat", () => {
    expect(checkCanRematch(room({ status: "WRAPPED" }), host())).toEqual({
      ok: true,
      value: { alreadyInLobby: false },
    });
    expect(checkCanRematch(room({ status: "LOBBY" }), host())).toEqual({ ok: true, value: { alreadyInLobby: true } });
    expect(checkCanRematch(room({ status: "IN_GAME" }), host())).toEqual({ ok: false, error: "game_not_finished" });
    expect(checkCanRematch(room({ status: "WRAPPED" }), player("p2"))).toEqual({ ok: false, error: "not_host" });
  });
});
