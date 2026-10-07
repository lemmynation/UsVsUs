import type { GameView } from "@/types/game";
import type { RoomView } from "@/types/room";

/** Posts a game action; resolves true on success. Errors are shown by the caller. */
export type GameAction = (key: string, path: string, body?: unknown) => Promise<boolean>;

export interface GameScreenProps {
  view: RoomView & { game: GameView };
  act: GameAction;
  pending: string | null;
}
