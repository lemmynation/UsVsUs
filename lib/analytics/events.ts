/** Funnel events from the design doc (section 14) that exist as of Phase 1. */
export const SERVER_EVENTS = ["room_created", "player_joined", "game_started"] as const;

/** Events the browser may report itself. Anything else is rejected. */
export const CLIENT_EVENTS = ["landing_view", "mode_selected", "invite_shared"] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type ClientEventName = (typeof CLIENT_EVENTS)[number];
