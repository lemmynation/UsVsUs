/** Funnel events from the design doc (section 14) that exist so far. */
export const SERVER_EVENTS = [
  "room_created",
  "player_joined",
  "game_started",
  "question_answered",
  "game_completed",
] as const;

/** Events the browser may report itself. Anything else is rejected. */
export const CLIENT_EVENTS = [
  "landing_view",
  "mode_selected",
  "invite_shared",
  "wrapped_viewed",
  "wrapped_shared",
  "play_again_clicked",
] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type ClientEventName = (typeof CLIENT_EVENTS)[number];
