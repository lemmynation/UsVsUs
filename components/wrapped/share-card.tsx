/**
 * The 1080×1920 portrait share card (design doc §7), rendered to PNG by
 * `next/og`. Satori supports only flexbox and inline styles: every element with
 * more than one child needs `display: flex`. Names are nicknames (no "You"),
 * because the card is seen by people outside the room. Circle cards show badge
 * winners only — never who voted for whom.
 */
import { CATEGORY_META, formatNames, GAME_TYPE_META, percentOf, wrappedHeadline } from "@/lib/game/presentation";
import { MODE_META } from "@/lib/modes";
import type { WrappedReport } from "@/types/game";
import type { Mode } from "@/types/room";

export const SHARE_CARD_SIZE = { width: 1080, height: 1920 } as const;

/** sRGB versions of the app's mode accents (globals.css uses oklch, which Satori can't parse). */
const MODE_COLORS: Record<Mode, [string, string]> = {
  couple: ["#ff6f9f", "#a65cf0"],
  friends: ["#58a6f2", "#7b5cf0"],
  circle: ["#f5a23d", "#a65cf0"],
};
const BG = "#1a1325";
const CARD = "#271d36";
const FG = "#f6f2fb";
const MUTED = "#bbb1cc";

const MAX_AWARD_ROWS = 5;
/** Ties of more people than this read as "4-way tie" on the card. */
const MAX_NAMED_TIE = 3;

export function ShareCard({ report, site }: { report: WrappedReport; site: string }) {
  const [from, to] = MODE_COLORS[report.mode];
  const gradient = `linear-gradient(135deg, ${from}, ${to})`;
  const twoPlayer = report.mode !== "circle";
  const subtitle = report.roomName ?? `${MODE_META[report.mode].label} night`;
  const topCategory = report.categories[0];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: BG,
        backgroundImage: `radial-gradient(circle at 50% 0%, ${from}55, ${BG} 60%)`,
        color: FG,
        padding: "110px 90px 90px",
        fontSize: 40,
        gap: 48,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 8, color: MUTED }}>US VS. US · WRAPPED</div>
        <div style={{ display: "flex", fontSize: 44, color: MUTED, textAlign: "center" }}>{subtitle}</div>
        <div
          style={{
            display: "flex",
            fontSize: 104,
            lineHeight: 1.1,
            textAlign: "center",
            backgroundImage: gradient,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {wrappedHeadline(report, null)}
        </div>
      </div>

      {report.usScore !== null && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "36px 90px",
              borderRadius: 60,
              backgroundImage: gradient,
              color: BG,
            }}
          >
            <div style={{ display: "flex", fontSize: 40 }}>Us Score</div>
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 200, lineHeight: 1 }}>
              {report.usScore}
              <span style={{ fontSize: 64 }}>/100</span>
            </div>
          </div>
        </div>
      )}

      {twoPlayer ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {report.players.map((p) => (
            <Row key={p.id} left={p.nickname} right={`${p.points} pts`} highlight={report.winnerIds?.[0] === p.id} />
          ))}
          {topCategory && topCategory.possible > 0 && (
            <div style={{ display: "flex", justifyContent: "center", color: MUTED, fontSize: 38 }}>
              {`Best category: ${CATEGORY_META[topCategory.category].emoji} ${CATEGORY_META[topCategory.category].label} · ${percentOf(topCategory.earned, topCategory.possible)}%`}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {report.awards.slice(0, MAX_AWARD_ROWS).map((a, i) => (
            <Row
              key={i}
              left={a.label}
              right={formatNames(
                a.playerIds.map((id) => report.players.find((p) => p.id === id)?.nickname ?? "?"),
                MAX_NAMED_TIE,
              )}
            />
          ))}
          {report.awards.length === 0 && (
            <div style={{ display: "flex", justifyContent: "center", color: MUTED }}>No badges this time</div>
          )}
        </div>
      )}

      {twoPlayer && report.rounds.some((r) => r.possible > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          {report.rounds.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
                padding: "24px 12px",
                borderRadius: 36,
                backgroundColor: CARD,
              }}
            >
              <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{GAME_TYPE_META[r.gameType].title}</div>
              <div style={{ display: "flex", fontSize: 56 }}>{`${percentOf(r.earned, r.possible)}%`}</div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: 54,
          lineHeight: 1.3,
          minHeight: 220,
        }}
      >
        {`“${report.roast}”`}
      </div>

      <div style={{ display: "flex", justifyContent: "center", fontSize: 36, color: MUTED }}>
        {`Play your own at ${site}`}
      </div>
    </div>
  );
}

function Row({ left, right, highlight = false }: { left: string; right: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "28px 40px",
        borderRadius: 40,
        backgroundColor: CARD,
        border: highlight ? `4px solid ${FG}` : `4px solid ${CARD}`,
        fontSize: 48,
      }}
    >
      <div style={{ display: "flex", flex: 1, minWidth: 0 }}>{left}</div>
      <div style={{ display: "flex", maxWidth: "48%", justifyContent: "flex-end", textAlign: "right" }}>{right}</div>
    </div>
  );
}
