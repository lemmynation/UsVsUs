"use client";

import { useEffect } from "react";
import type { GameScreenProps } from "@/components/game/types";
import { trackClient } from "@/lib/client-api";
import { FeedbackCard } from "./feedback-card";
import { ReactionBar } from "@/components/game/reactions";
import { RematchPanel } from "./rematch-panel";
import { SeriesBanner } from "./series-banner";
import { ShareActions } from "./share-actions";
import {
  reportNames,
  WrappedBadges,
  WrappedBreakdown,
  WrappedHero,
  WrappedHighlightCard,
  WrappedStandings,
} from "./wrapped-sections";

/** S11: the end-of-game Wrapped report and share card. */
export function WrappedScreen(props: GameScreenProps) {
  const { view } = props;
  const report = view.game.wrapped;
  const roomId = view.room.id;
  useEffect(() => trackClient("wrapped_viewed", { mode: view.room.mode }, roomId), [roomId, view.room.mode]);

  if (!report) {
    return <p className="text-muted-foreground text-center text-lg">Wrapping up your results…</p>;
  }
  const names = reportNames(report, view.me.playerId);
  const twoPlayer = report.mode !== "circle";

  return (
    <>
      <WrappedHero report={report} meId={view.me.playerId} />
      <SeriesBanner series={view.game.series} nameOf={names.labelOf} />
      {twoPlayer ? <WrappedStandings report={report} names={names} /> : <WrappedBadges report={report} names={names} />}
      {/* Hidden when nothing was scoreable (e.g. the game ended early): all-dash bars say nothing. */}
      {twoPlayer && report.rounds.some((r) => r.possible > 0) && <WrappedBreakdown report={report} />}
      {report.highlight && <WrappedHighlightCard highlight={report.highlight} names={names} />}
      <ReactionBar />
      <RematchPanel {...props} />
      <ShareActions roomId={roomId} mode={report.mode} />
      <FeedbackCard roomId={roomId} />
    </>
  );
}
