/**
 * Series score (engagement phase): what carries over between games in the same
 * room, so a Rematch is "best of 3?" rather than "the same thing again". Built
 * only from frozen Wrapped reports. Pure and tested.
 */
import type { Series, WrappedReport } from "@/types/game";

export type { Series };

/** The room's series so far, or null before there's a second game to compare. */
export function seriesFor(reports: WrappedReport[], playerIds: string[]): Series | null {
  const counted = reports.filter((r) => !r.endedEarly);
  if (counted.length < 2 || playerIds.length === 0) return null;
  const circle = counted[0].mode === "circle";
  const tally = new Map<string, number>(playerIds.map((id) => [id, 0]));
  let draws = 0;

  for (const report of counted) {
    if (circle) {
      for (const award of report.awards) {
        for (const id of award.playerIds) if (tally.has(id)) tally.set(id, tally.get(id)! + 1);
      }
    } else if (!report.winnerIds || report.winnerIds.length !== 1) {
      draws++;
    } else {
      const [winner] = report.winnerIds;
      if (tally.has(winner)) tally.set(winner, tally.get(winner)! + 1);
    }
  }

  const order = new Map(playerIds.map((id, i) => [id, i]));
  return {
    games: counted.length,
    kind: circle ? "badges" : "wins",
    standings: [...tally]
      .map(([playerId, count]) => ({ playerId, count }))
      .sort((a, b) => b.count - a.count || order.get(a.playerId)! - order.get(b.playerId)!),
    draws,
  };
}

/** One line for the screen, e.g. "Ana leads the series 2–1" or "Series tied 1–1". */
export function seriesHeadline(series: Series, nameOf: (id: string) => string): string {
  const [first, second] = series.standings;
  if (series.kind === "badges") {
    return first.count > 0 ? `${nameOf(first.playerId)} leads tonight with ${first.count} badges` : "No badges yet";
  }
  const score = `${first.count}–${second?.count ?? 0}`;
  if (!second || first.count > second.count) {
    const who = nameOf(first.playerId);
    return `${who} ${who === "You" ? "lead" : "leads"} the series ${score}`;
  }
  return `Series tied ${score}`;
}
