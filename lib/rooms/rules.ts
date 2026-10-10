/**
 * Pure room rules. No I/O, no framework imports — every function here is
 * deterministic given its inputs so it can be unit tested directly.
 */
import type { Mode, Player, Room, RoomStatus } from "@/types/room";

export const MODE_RULES: Record<Mode, { minPlayers: number; maxPlayers: number }> = {
  couple: { minPlayers: 2, maxPlayers: 2 },
  friends: { minPlayers: 2, maxPlayers: 2 },
  circle: { minPlayers: 3, maxPlayers: 10 },
};

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** Extra time a game already in progress gets past the room's expiry. */
export const IN_GAME_GRACE_MS = 6 * 60 * 60 * 1000;
export const ONLINE_WINDOW_MS = 20_000;

/** No 0/O, 1/I/L — codes get read aloud and typed on phones. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

export const NICKNAME_MAX = 20;
export const ROOM_NAME_MAX = 40;

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T) => ({ ok: true, value }) as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

export function generateJoinCode(randomInt: (maxExclusive: number) => number): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** Accepts "abc 234", "ABC-234" etc. Returns null if it can't be a valid code. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

// Control characters and invisible formatting characters (zero-width spaces,
// bidi overrides). The zero-width joiner U+200D is kept so emoji like 👩‍❤️‍👨 survive.
const INVISIBLE_CHARS = /(?!‍)[\p{Cc}\p{Cf}]/gu;

function cleanText(input: string): string {
  // Whitespace first: line breaks and tabs are control characters too, and should become spaces.
  return input.replace(/\s+/g, " ").replace(INVISIBLE_CHARS, "").replace(/ {2,}/g, " ").trim();
}

export const FEEDBACK_COMMENT_MAX = 500;

/** Optional free text with a game rating: tidied, capped, and null when empty. */
export function sanitizeFeedbackComment(input: string | null | undefined): string | null {
  const text = cleanText(input ?? "");
  return text.length === 0 ? null : [...text].slice(0, FEEDBACK_COMMENT_MAX).join("");
}

export function sanitizeNickname(input: string): Result<string, "nickname_required" | "nickname_too_long"> {
  const name = cleanText(input);
  if (name.length === 0) return fail("nickname_required");
  if ([...name].length > NICKNAME_MAX) return fail("nickname_too_long");
  return ok(name);
}

export function sanitizeRoomName(input: string | null | undefined): Result<string | null, "room_name_too_long"> {
  const name = cleanText(input ?? "");
  if (name.length === 0) return ok(null);
  if ([...name].length > ROOM_NAME_MAX) return fail("room_name_too_long");
  return ok(name);
}

export function computeExpiresAt(now: Date): string {
  return new Date(now.getTime() + ROOM_TTL_MS).toISOString();
}

/**
 * Rooms expire lazily: an open room past its expiry reads as EXPIRED. A game that
 * started shortly before the deadline gets a grace period to finish instead of
 * being cut off mid-question.
 */
export function effectiveStatus(room: Room, now: Date): RoomStatus {
  if (room.status !== "LOBBY" && room.status !== "IN_GAME") return room.status;
  const grace = room.status === "IN_GAME" ? IN_GAME_GRACE_MS : 0;
  return new Date(room.expiresAt).getTime() + grace <= now.getTime() ? "EXPIRED" : room.status;
}

export function activePlayers(players: Player[]): Player[] {
  return players.filter((p) => p.status === "active");
}

export function isOnline(player: Player, now: Date): boolean {
  return now.getTime() - new Date(player.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

export type JoinError = "room_expired" | "room_closed" | "room_in_progress" | "room_full" | "nickname_taken" | "kicked";

/** Whether this visitor could join the room at all, before they pick a nickname. */
export function checkRoomJoinable(
  room: Room,
  players: Player[],
  sessionTokenHash: string | null,
  now: Date,
): Result<null, Exclude<JoinError, "nickname_taken">> {
  const existing = sessionTokenHash ? players.find((p) => p.sessionTokenHash === sessionTokenHash) : undefined;
  if (existing?.status === "kicked") return fail("kicked");

  const status = effectiveStatus(room, now);
  if (status === "EXPIRED") return fail("room_expired");
  if (status === "IN_GAME") return fail("room_in_progress");
  if (status !== "LOBBY") return fail("room_closed");

  if (activePlayers(players).length >= MODE_RULES[room.mode].maxPlayers) return fail("room_full");
  return ok(null);
}

export function checkCanJoin(
  room: Room,
  players: Player[],
  nickname: string,
  sessionTokenHash: string,
  now: Date,
): Result<null, JoinError> {
  const joinable = checkRoomJoinable(room, players, sessionTokenHash, now);
  if (!joinable.ok) return joinable;

  // Plain toLowerCase (not locale-aware) to match Postgres lower() in the unique index.
  const lower = nickname.toLowerCase();
  const taken = activePlayers(players).some((p) => p.nickname.toLowerCase() === lower);
  if (taken) return fail("nickname_taken");

  return ok(null);
}

export type StartError = "not_host" | "room_expired" | "not_in_lobby" | "not_enough_players";

export function checkCanStart(room: Room, players: Player[], actor: Player, now: Date): Result<null, StartError> {
  if (!actor.isHost || room.hostPlayerId !== actor.id) return fail("not_host");
  const status = effectiveStatus(room, now);
  if (status === "EXPIRED") return fail("room_expired");
  if (status !== "LOBBY") return fail("not_in_lobby");
  if (activePlayers(players).length < MODE_RULES[room.mode].minPlayers) return fail("not_enough_players");
  return ok(null);
}

export type RematchError = "not_host" | "game_not_finished";

/**
 * Rematch: the host sends the whole group from Wrapped back to the lobby of the
 * same room. Already back in the lobby (a double tap, or it just happened) is fine.
 */
export function checkCanRematch(room: Room, actor: Player): Result<{ alreadyInLobby: boolean }, RematchError> {
  if (!actor.isHost || room.hostPlayerId !== actor.id) return fail("not_host");
  if (room.status === "LOBBY") return ok({ alreadyInLobby: true });
  if (room.status !== "WRAPPED") return fail("game_not_finished");
  return ok({ alreadyInLobby: false });
}

export type KickError = "not_host" | "cannot_kick_self" | "player_not_found" | "room_closed";

export function checkCanKick(
  room: Room,
  actor: Player,
  target: Player | undefined,
  now: Date,
): Result<null, KickError> {
  if (!actor.isHost || room.hostPlayerId !== actor.id) return fail("not_host");
  const status = effectiveStatus(room, now);
  if (status !== "LOBBY" && status !== "IN_GAME") return fail("room_closed");
  if (!target || target.roomId !== room.id || target.status !== "active") return fail("player_not_found");
  if (target.id === actor.id) return fail("cannot_kick_self");
  return ok(null);
}

/** Earliest-joined remaining player becomes host. */
export function nextHost(players: Player[], leavingPlayerId: string): Player | null {
  const remaining = activePlayers(players)
    .filter((p) => p.id !== leavingPlayerId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  return remaining[0] ?? null;
}
