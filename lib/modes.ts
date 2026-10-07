import { MODE_RULES } from "@/lib/rooms/rules";
import type { Mode } from "@/types/room";

export const MODE_META: Record<
  Mode,
  { label: string; players: string; tagline: string; emoji: string; className: string }
> = {
  couple: {
    label: "Couple",
    players: "2 players",
    tagline: "Date night, long-distance, or just because.",
    emoji: "💞",
    className: "mode-couple",
  },
  friends: {
    label: "Friends",
    players: "2 players",
    tagline: "Who really knows who better?",
    emoji: "🤝",
    className: "mode-friends",
  },
  circle: {
    label: "Circle",
    players: `${MODE_RULES.circle.minPlayers}–${MODE_RULES.circle.maxPlayers} players`,
    tagline: "Barkada night, reunions, chaos.",
    emoji: "🔥",
    className: "mode-circle",
  },
};
