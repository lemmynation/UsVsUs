import { PlayerAvatar } from "@/components/room/player-avatar";
import { GradientText } from "@/components/ui/gradient-text";
import { CATEGORY_META, GAME_TYPE_META, percentOf, wrappedHeadline } from "@/lib/game/presentation";
import { MODE_META } from "@/lib/modes";
import { cn } from "@/lib/utils";
import type { WrappedHighlight, WrappedReport } from "@/types/game";

/** Name lookups from the report's own snapshot, so people who left later still have names. */
export function reportNames(report: WrappedReport, meId: string) {
  const nicknameOf = (id: string) => report.players.find((p) => p.id === id)?.nickname ?? "Someone who left";
  return { nicknameOf, labelOf: (id: string) => (id === meId ? "You" : nicknameOf(id)) };
}

type Names = ReturnType<typeof reportNames>;

/** Headline, Us Score and the roast line. */
export function WrappedHero({ report, meId }: { report: WrappedReport; meId: string }) {
  const subtitle = report.roomName ?? `${MODE_META[report.mode].label} night`;
  return (
    <section className="animate-in fade-in zoom-in-95 flex flex-col items-center gap-3 text-center duration-500">
      <p className="text-muted-foreground text-base font-semibold tracking-widest uppercase">{subtitle} · Wrapped</p>
      <h1 className="font-heading text-5xl font-extrabold break-words">
        <GradientText>{wrappedHeadline(report, meId)}</GradientText>
      </h1>
      {report.usScore !== null && (
        <div className="border-mode-gradient mt-2 flex flex-col items-center rounded-3xl px-8 py-4">
          <span className="text-muted-foreground text-base font-semibold">Us Score</span>
          <span className="font-heading text-6xl font-extrabold tabular-nums">
            {report.usScore}
            <span className="text-muted-foreground text-2xl">/100</span>
          </span>
          <span className="text-muted-foreground text-sm">Points earned out of points possible — just for fun.</span>
        </div>
      )}
      {report.endedEarly && (
        <p className="text-muted-foreground text-lg">Everyone else left, so the game ended early.</p>
      )}
      <p className="text-xl font-semibold text-balance">“{report.roast}”</p>
    </section>
  );
}

/** 2-player final Game Score. */
export function WrappedStandings({ report, names }: { report: WrappedReport; names: Names }) {
  const winners = new Set(report.winnerIds ?? []);
  return (
    <Section title="Game Score">
      <ol className="flex flex-col gap-2" aria-label="Final Game Score">
        {report.players.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl p-3",
              winners.has(p.id) && winners.size === 1 ? "border-mode-gradient" : "bg-card",
            )}
          >
            <PlayerAvatar nickname={p.nickname} />
            <span className="min-w-0 flex-1 text-lg font-semibold break-words">
              {names.labelOf(p.id)} {winners.has(p.id) && winners.size === 1 && <span aria-label="winner">👑</span>}
            </span>
            <span className="text-2xl font-extrabold tabular-nums">{p.points}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Circle: everyone's badges for the night. */
export function WrappedBadges({ report, names }: { report: WrappedReport; names: Names }) {
  return (
    <Section title="Tonight's awards">
      {report.awards.length === 0 ? (
        <p className="text-muted-foreground text-lg">No badges handed out this time.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Awards">
          {report.players.map((p) => (
            <li key={p.id} className="bg-card flex items-start gap-3 rounded-2xl p-3">
              <PlayerAvatar nickname={p.nickname} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-lg font-semibold break-words">{names.labelOf(p.id)}</span>
                {p.awards.length === 0 ? (
                  <span className="text-muted-foreground text-base">Flew under the radar 🕵️</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {p.awards.map((label, i) => (
                      <span key={i} className="bg-muted rounded-full px-2.5 py-0.5 text-sm font-semibold">
                        {label}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const TOP_CATEGORIES = 3;

/** Points per round, and the strongest categories (2-player). */
export function WrappedBreakdown({ report }: { report: WrappedReport }) {
  return (
    <>
      <Section title="Round by round">
        <ul className="flex flex-col gap-2" aria-label="Rounds">
          {report.rounds.map((r, i) => (
            <Bar
              key={i}
              label={`${GAME_TYPE_META[r.gameType].emoji} ${GAME_TYPE_META[r.gameType].title}`}
              earned={r.earned}
              possible={r.possible}
            />
          ))}
        </ul>
      </Section>
      {report.categories.length > 0 && (
        <Section title="Your strongest topics">
          <ul className="flex flex-col gap-2" aria-label="Categories">
            {report.categories.slice(0, TOP_CATEGORIES).map((c) => (
              <Bar
                key={c.category}
                label={`${CATEGORY_META[c.category].emoji} ${CATEGORY_META[c.category].label}`}
                earned={c.earned}
                possible={c.possible}
              />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Bar({ label, earned, possible }: { label: string; earned: number; possible: number }) {
  const pct = percentOf(earned, possible);
  return (
    <li className="bg-card relative overflow-hidden rounded-2xl p-3">
      <div aria-hidden className="bg-mode-gradient absolute inset-y-0 left-0 opacity-30" style={{ width: `${pct}%` }} />
      <div className="relative flex items-center justify-between gap-3">
        <span className="min-w-0 text-lg font-semibold break-words">{label}</span>
        <span className="shrink-0 text-base font-bold tabular-nums">
          {possible > 0 ? `${earned} / ${possible}` : "—"}
        </span>
      </div>
    </li>
  );
}

/** The most surprising disagreement (2-player) or the biggest split (Circle). */
export function WrappedHighlightCard({ highlight, names }: { highlight: WrappedHighlight; names: Names }) {
  const title = highlight.kind === "disagreement" ? "Most surprising disagreement" : "Most divided moment";
  return (
    <Section title={title}>
      <div className="border-mode-gradient flex flex-col gap-3 rounded-3xl p-4">
        <p className="text-xl font-bold break-words">{highlight.prompt}</p>
        {highlight.kind === "disagreement" ? (
          <ul className="flex flex-col gap-2">
            {highlight.lines.map((line) => (
              <li key={line.playerId} className="flex items-center gap-3">
                <PlayerAvatar nickname={names.nicknameOf(line.playerId)} className="size-9 text-sm" />
                <span className="min-w-0 text-base break-words">
                  <strong>{names.labelOf(line.playerId)}</strong> {line.verb} <strong>{line.answer}</strong>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-1">
            {highlight.counts.map((c) => (
              <li key={c.label} className="flex justify-between gap-3 text-base">
                <span className="min-w-0 break-words">{c.label}</span>
                <strong className="shrink-0">
                  {c.count} {c.count === 1 ? "pick" : "picks"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `wrapped-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
