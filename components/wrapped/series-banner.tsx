import { seriesHeadline } from "@/lib/game/series";
import type { Series } from "@/types/game";

/** "Ana leads the series 2–1": what carries over between rematches in one room. */
export function SeriesBanner({ series, nameOf }: { series: Series | null; nameOf: (id: string) => string }) {
  if (!series) return null;
  return (
    <p className="border-mode-gradient rounded-2xl px-4 py-3 text-center text-base font-semibold" data-testid="series">
      🏆 {seriesHeadline(series, nameOf)}
      <span className="text-muted-foreground block text-sm font-normal">
        {series.games} games in this room{series.draws > 0 ? ` · ${series.draws} tied` : ""}
      </span>
    </p>
  );
}
