import type { GameView } from "./game";
import type { PremiumView } from "./premium";

export const MODES = ["couple", "friends", "circle"] as const;
export type Mode = (typeof MODES)[number];

export const ROOM_STATUSES = ["LOBBY", "IN_GAME", "WRAPPED", "COMPLETED", "EXPIRED", "ABANDONED"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export type PlayerStatus = "active" | "kicked";

export type Experience = "quick_party" | "chain_reactions";

export interface Room {
  id: string;
  joinCode: string;
  mode: Mode;
  /** Quick Party (the quiz games) or Chain Reactions (Mutation Machine). */
  experience: Experience;
  name: string | null;
  hostPlayerId: string | null;
  status: RoomStatus;
  selectedPackId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface Player {
  id: string;
  roomId: string;
  nickname: string;
  sessionTokenHash: string;
  isHost: boolean;
  status: PlayerStatus;
  joinedAt: string;
  lastSeenAt: string;
}

/** What a room member is allowed to see. Never includes session hashes. */
export interface RoomView {
  room: {
    id: string;
    joinCode: string;
    mode: Mode;
    name: string | null;
    status: RoomStatus;
    expiresAt: string;
    minPlayers: number;
    maxPlayers: number;
  };
  players: Array<{
    id: string;
    nickname: string;
    isHost: boolean;
    isOnline: boolean;
  }>;
  me: { playerId: string; isHost: boolean };
  /** Present once the host has started a game. */
  game: GameView | null;
  /** Premium packs for this room's mode and what's unlocked. */
  premium: PremiumView;
}

/** Public info shown on the join screen before someone is a member. */
export interface RoomPreview {
  joinCode: string;
  mode: Mode;
  name: string | null;
  /** Who's inviting: the current host's nickname (null if the room has no host right now). */
  hostNickname: string | null;
  playerCount: number;
  maxPlayers: number;
}
