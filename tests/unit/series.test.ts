import { describe, expect, it } from "vitest";
import { seriesFor, seriesHeadline } from "@/lib/game/series";
import type { WrappedReport } from "@/types/game";

function report(overrides: Partial<WrappedReport>): WrappedReport {
  return {
    version: 1,
    sessionId: "s",
    mode: "couple",
    roomName: null,
    players: [],
    endedEarly: false,
    winnerIds: null,
    usScore: null,
    rounds: [],
    categories: [],
    awards: [],
    highlight: null,
    roast: "",
    ...overrides,
  };
}
const nameOf = (id: string) => (id === "ana" ? "You" : id === "lem" ? "Lem" : id);

describe("series score", () => {
  it("only appears once there's a second finished game", () => {
    expect(seriesFor([report({ winnerIds: ["lem"] })], ["lem", "ana"])).toBeNull();
    const early = report({ endedEarly: true });
    expect(seriesFor([report({ winnerIds: ["lem"] }), early], ["lem", "ana"])).toBeNull();
  });

  it("counts 2-player wins and draws", () => {
    const s = seriesFor(
      [
        report({ winnerIds: ["lem"] }),
        report({ winnerIds: ["ana"] }),
        report({ winnerIds: ["ana"] }),
        report({ winnerIds: ["lem", "ana"] }),
      ],
      ["lem", "ana"],
    )!;
    expect(s).toEqual({
      games: 4,
      kind: "wins",
      draws: 1,
      standings: [
        { playerId: "ana", count: 2 },
        { playerId: "lem", count: 1 },
      ],
    });
    expect(seriesHeadline(s, nameOf)).toBe("You lead the series 2–1");
  });

  it("says when the series is tied", () => {
    const s = seriesFor([report({ winnerIds: ["lem"] }), report({ winnerIds: ["ana"] })], ["lem", "ana"])!;
    expect(seriesHeadline(s, nameOf)).toBe("Series tied 1–1");
  });

  it("totals Circle badges across games, ignoring people who left", () => {
    const s = seriesFor(
      [
        report({
          mode: "circle",
          awards: [
            { label: "A", playerIds: ["lem"] },
            { label: "B", playerIds: ["ben"] },
          ],
        }),
        report({ mode: "circle", awards: [{ label: "C", playerIds: ["lem", "gone"] }] }),
      ],
      ["lem", "ben", "ana"],
    )!;
    expect(s.kind).toBe("badges");
    expect(s.standings).toEqual([
      { playerId: "lem", count: 2 },
      { playerId: "ben", count: 1 },
      { playerId: "ana", count: 0 },
    ]);
    expect(seriesHeadline(s, nameOf)).toBe("Lem leads tonight with 2 badges");
  });
});
