"use client";

import { GameFinished } from "./game-finished";
import { QuestionScreen } from "./question-screen";
import { RevealScreen } from "./reveal-screen";
import { RoundEnd } from "./round-end";
import { RoundIntro } from "./round-intro";
import type { GameScreenProps } from "./types";

/** Renders whichever step the server says the game is on. */
export function GameScreen(props: GameScreenProps) {
  const { game } = props.view;
  // Keyed by version so each step mounts fresh (resets local state and replays its entrance).
  const key = `${game.sessionId}:${game.stateVersion}`;
  switch (game.phase) {
    case "ROUND_INTRO":
      return <RoundIntro key={key} {...props} />;
    case "QUESTION_OPEN":
      // Same question across "someone answered" updates: key by question, not version.
      return <QuestionScreen key={`${game.sessionId}:${game.roundIndex}.${game.questionIndex}`} {...props} />;
    case "REVEAL":
      return <RevealScreen key={key} {...props} />;
    case "SCOREBOARD":
      return <RoundEnd key={key} {...props} />;
    case "FINISHED":
      return <GameFinished view={props.view} />;
  }
}
