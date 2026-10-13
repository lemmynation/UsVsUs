/**
 * The 1080×1920 Mutation Machine share card, rendered to PNG by `next/og` (same rules as
 * the Mind Match card: flexbox only, `display: flex` on every multi-child element, sRGB).
 * Nicknames only, titles and points, and the sneakiest mutation the reveal already showed:
 * never drawings, never who guessed what.
 */
import { BG, CARD, FG, MODE_COLORS, MUTED, Row } from "@/components/wrapped/share-card";
import { chaosHeadline, TITLE_EMOJI, type ChaosWrappedReport } from "@/lib/chaos/wrapped";
import type { Mode } from "@/types/room";

const MAX_PLAYER_ROWS = 6;

export function ChaosShareCard({ report, mode, site }: { report: ChaosWrappedReport; mode: Mode; site: string }) {
  const [from, to] = MODE_COLORS[mode];
  const gradient = `linear-gradient(135deg, ${from}, ${to})`;
  const nameOf = (id: string) => report.players.find((p) => p.id === id)?.nickname ?? "someone who left";
  const moment = report.sneakiest ?? report.clearest;

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
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 8, color: MUTED }}>
          US VS. US · MUTATION MACHINE
        </div>
        <div style={{ display: "flex", fontSize: 44, color: MUTED, textAlign: "center" }}>
          {report.roomName ?? `${report.chainCount} chains of chaos`}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            lineHeight: 1.1,
            textAlign: "center",
            backgroundImage: gradient,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {chaosHeadline(report)}
        </div>
      </div>

      {report.isDuo && (
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
            <div style={{ display: "flex", fontSize: 40 }}>Team score</div>
            <div style={{ display: "flex", fontSize: 200, lineHeight: 1 }}>{report.teamScore}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {report.players.slice(0, MAX_PLAYER_ROWS).map((p) => (
          <Row
            key={p.id}
            left={p.nickname ?? "Someone who left"}
            right={report.isDuo ? `${TITLE_EMOJI[p.title]} ${p.title}` : `${TITLE_EMOJI[p.title]} ${p.points} pts`}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 16,
          minHeight: 220,
        }}
      >
        {moment && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "36px 48px",
              borderRadius: 40,
              backgroundColor: CARD,
            }}
          >
            <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
              {moment === report.sneakiest ? "🌪️ Sneakiest mutation" : "🔎 Clearest mutation"}
            </div>
            <div style={{ display: "flex", fontSize: 54, lineHeight: 1.2 }}>{`${moment.object} + ${moment.label}`}</div>
            <div style={{ display: "flex", fontSize: 36, color: MUTED }}>
              {`by ${nameOf(moment.mutatorId)} · ${moment.spotted} of ${moment.guesses} spotted it`}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", fontSize: 36, color: MUTED }}>
        {`Play your own at ${site}`}
      </div>
    </div>
  );
}
