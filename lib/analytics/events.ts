/** Funnel events from the design doc (section 14) that exist so far. */
export const SERVER_EVENTS = [
  "room_created",
  "player_joined",
  "game_started",
  "question_answered",
  "game_completed",
  "checkout_started",
  "purchase_succeeded",
  "purchase_failed",
  "rematch_started",
  "reaction_sent",
  // Chain Reactions (UsVsUs 4.2)
  "chaos_match_started",
  "contribution_submitted",
  "chaos_step_skipped",
  "chaos_match_completed",
  // Technical health (design doc §14)
  "join_failed",
  "api_timing",
  "server_error",
  "client_error",
] as const;

/** Events the browser may report itself. Anything else is rejected. */
export const CLIENT_EVENTS = [
  "landing_view",
  "mode_selected",
  "invite_shared",
  "wrapped_viewed",
  "wrapped_shared",
  "play_again_clicked",
  "premium_pack_viewed",
  // Sent when a phone gets its connection back (it can't report while offline).
  "connection_restored",
] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type ClientEventName = (typeof CLIENT_EVENTS)[number];
