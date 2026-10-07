import { PlayerAvatar } from "@/components/room/player-avatar";
import { cn } from "@/lib/utils";
import { playerNames } from "./names";
import type { GameScreenProps } from "./types";

/** Game Score standings (2-player modes). */
export function Standings({ view, showRound }: { view: GameScreenProps["view"]; showRound: boolean }) {
  const { game } = view;
  const names = playerNames(view);
  const top = game.standings[0]?.points ?? 0;
  return (
    <ol className="flex flex-col gap-2" aria-label="Game Score">
      {game.standings.map(({ playerId, points }) => {
        const leading = points > 0 && points === top;
        const roundPts = game.roundPoints[playerId] ?? 0;
        return (
          <li
            key={playerId}
            className={cn("flex items-center gap-3 rounded-2xl p-3", leading ? "border-mode-gradient" : "bg-card")}
          >
            <PlayerAvatar nickname={names.nicknameOf(playerId)} />
            <span className="flex-1 text-lg font-semibold">
              {names.labelOf(playerId)} {leading && <span aria-label="leading">👑</span>}
            </span>
            <span className="flex flex-col items-end">
              <span className="text-2xl font-extrabold tabular-nums">{points}</span>
              {showRound && <span className="text-muted-foreground text-sm">+{roundPts} this round</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Circle badges, grouped by player. */
export function Badges({ view }: { view: GameScreenProps["view"] }) {
  const names = playerNames(view);
  const byPlayer = new Map<string, string[]>();
  for (const a of view.game.awards) byPlayer.set(a.playerId, [...(byPlayer.get(a.playerId) ?? []), a.label]);
  if (byPlayer.size === 0) return <p className="text-muted-foreground text-lg">No badges handed out yet.</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label="Badges">
      {[...byPlayer].map(([playerId, labels]) => (
        <li key={playerId} className="bg-card flex items-start gap-3 rounded-2xl p-3">
          <PlayerAvatar nickname={names.nicknameOf(playerId)} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-lg font-semibold">{names.labelOf(playerId)}</span>
            <span className="flex flex-wrap gap-1.5">
              {labels.map((label, i) => (
                <span key={i} className="bg-muted rounded-full px-2.5 py-0.5 text-sm font-semibold">
                  {label}
                </span>
              ))}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
