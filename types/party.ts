import type { ChaosSpectatorView } from "@/lib/chaos/projections";
import type { Mode, RoomStatus } from "./room";

/** A TV or laptop paired to a room as a read-only spectator (UsVsUs 4.2 Sprint 2). */
export type DisplayStatus = "pending" | "approved" | "revoked" | "expired";

export interface PartyDisplay {
  id: string;
  /** Null until a host approves the pairing code. */
  roomId: string | null;
  pairingCodeHash: string;
  tokenHash: string;
  status: DisplayStatus;
  approvedByPlayerId: string | null;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
}

/** What the host's phone shows about a connected TV. Never the token or the code. */
export interface DisplaySummary {
  id: string;
  /** "TV 1", "TV 2", in pairing order. */
  label: string;
  /** Showing the game (seen in the last half minute), paired but not loaded yet, or gone quiet. */
  status: "showing" | "connecting" | "away";
}

/** Everything a paired TV may show: public room info and the public side of the match. */
export interface SpectatorView {
  room: {
    id: string;
    joinCode: string;
    mode: Mode;
    name: string | null;
    status: RoomStatus;
    minPlayers: number;
    maxPlayers: number;
  };
  players: Array<{ id: string; nickname: string; isHost: boolean; isOnline: boolean }>;
  /** The match on screen (null in the lobby, rematch lobby included). */
  chaos: ChaosSpectatorView | null;
}

/** GET /api/party/me: where this TV stands. */
export type SpectatorState =
  | { status: "unpaired"; reason: "new" | "expired" | "revoked" }
  | { status: "pending"; expiresAt: string }
  | { status: "ended" }
  | { status: "paired"; view: SpectatorView };
