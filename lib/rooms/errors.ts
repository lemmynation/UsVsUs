/** User-facing copy and HTTP status for every room error code. */
export const ROOM_ERRORS: Record<string, { status: number; message: string }> = {
  invalid_input: { status: 400, message: "Something about that request didn't look right." },
  invalid_code: { status: 400, message: "Room codes are 6 letters and numbers. Double-check and try again." },
  nickname_required: { status: 400, message: "Pick a nickname so everyone knows it's you." },
  nickname_too_long: { status: 400, message: "Keep your nickname to 20 characters or less." },
  room_name_too_long: { status: 400, message: "Keep the room name to 40 characters or less." },
  nickname_taken: { status: 409, message: "Someone in this room already has that nickname. Try another." },
  room_not_found: { status: 404, message: "We couldn't find that room. Check the code or ask for a new link." },
  room_expired: { status: 410, message: "This room has expired. Ask the host to start a new one." },
  room_closed: { status: 410, message: "This room is closed. Ask the host to start a new one." },
  room_in_progress: { status: 409, message: "This game already started. Ask the host to start a new room after." },
  room_full: { status: 409, message: "This room is full." },
  kicked: { status: 403, message: "The host removed you from this room." },
  not_in_room: { status: 403, message: "You're not in this room yet." },
  not_host: { status: 403, message: "Only the host can do that." },
  not_in_lobby: { status: 409, message: "The game has already started." },
  not_enough_players: { status: 409, message: "Waiting for more players to join." },
  cannot_kick_self: { status: 400, message: "You can't remove yourself. Use Leave room instead." },
  player_not_found: { status: 404, message: "That player isn't in the room anymore." },
  code_generation_failed: { status: 503, message: "We couldn't create a room right now. Please try again." },
  rate_limited: { status: 429, message: "Slow down a little — try again in a moment." },
};

export function errorMessage(code: string): string {
  return ROOM_ERRORS[code]?.message ?? "Something went wrong. Please try again.";
}
