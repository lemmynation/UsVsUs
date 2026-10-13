import { GAME_CONFIG } from "@/lib/game/state-machine";
import { MODE_RULES } from "@/lib/rooms/rules";
import type { Experience, Mode } from "@/types/room";

/**
 * The games you can pick on the home page, and how each one is explained before
 * anyone commits to a room. Copy only: the rules themselves live in lib/game and lib/chaos.
 */
export type GameKey = "quiz" | "chaos";

export interface Audience {
  mode: Mode;
  label: string;
  players: string;
  tagline: string;
  emoji: string;
}

export interface GameMeta {
  key: GameKey;
  experience: Experience;
  name: string;
  emoji: string;
  /** Colour theme (a mode-* class from globals.css; empty = the brand gradient). */
  className: string;
  pitch: string;
  players: string;
  duration: string;
  /** One concrete round, so people can picture it. */
  example: { label: string; lines: string[] };
  howToPlay: string[];
  audiences: Audience[];
}

const circlePlayers = `${MODE_RULES.circle.minPlayers}–${MODE_RULES.circle.maxPlayers} players`;

export const GAMES: Record<GameKey, GameMeta> = {
  quiz: {
    key: "quiz",
    experience: "quick_party",
    name: "Mind Match",
    emoji: "🧠",
    className: "",
    pitch: "Answer questions about each other and find out who really knows who.",
    players: `2–${MODE_RULES.circle.maxPlayers} players`,
    duration: "8–12 min",
    example: {
      label: "Example round · Mind Reader",
      lines: ["“What would Ana order at a milk tea shop?”", "Ana answers secretly. You guess. Match = points."],
    },
    howToPlay: [
      "Share the link. Everyone plays on their own phone.",
      `${GAME_CONFIG.rounds} rounds, ${GAME_CONFIG.questionsPerRound} quick questions each: guess what your people would say, pick This or That, and vote Who's More Likely.`,
      "Answers stay hidden until everyone's in, then the reveal shows who knows who.",
      "Finish with a Wrapped recap you can share, and hit Rematch for fresh questions.",
    ],
    audiences: [
      {
        mode: "couple",
        label: "Couple",
        players: "2 players",
        tagline: "Date night, long-distance, or just because.",
        emoji: "💞",
      },
      { mode: "friends", label: "Friends", players: "2 players", tagline: "Who really knows who better?", emoji: "🤝" },
      {
        mode: "circle",
        label: "Circle",
        players: circlePlayers,
        tagline: "Barkada night, reunions, chaos.",
        emoji: "🔥",
      },
    ],
  },
  chaos: {
    key: "chaos",
    experience: "chain_reactions",
    name: "Mutation Machine",
    emoji: "⚡",
    className: "mode-circle",
    pitch: "Draw a thing. Someone secretly mutates it. Spot what changed.",
    players: `2–${MODE_RULES.circle.maxPlayers} players`,
    duration: "8–10 min",
    example: {
      label: "Example chain",
      lines: [
        "You draw a cat. 🐈",
        "Ben secretly makes it “Has wings”.",
        "Ana guesses: what was it, and what happened?",
      ],
    },
    howToPlay: [
      "Everyone draws a secret thing (or types a short description instead).",
      "Drawings get passed on, and each player secretly mutates the one they get.",
      "Others play detective: what was it, and what changed?",
      "The reveal replays every chain step by step. Points for sharp eyes and clear mutations.",
    ],
    audiences: [
      {
        mode: "friends",
        label: "Duo Chaos",
        players: "2 players",
        tagline: "Mutate each other's drawings. Co-op.",
        emoji: "🤝",
      },
      {
        mode: "circle",
        label: "Circle Chaos",
        players: circlePlayers,
        tagline: "Everyone draws, mutates and detects at once.",
        emoji: "🔥",
      },
    ],
  },
};

export const gameForExperience = (experience: Experience): GameMeta =>
  experience === "chain_reactions" ? GAMES.chaos : GAMES.quiz;

/** Where to create a room for this game and audience. */
export const createHref = (game: GameKey, mode?: Mode) =>
  `/create?${new URLSearchParams({ game, ...(mode ? { mode } : {}) })}`;

export const audienceFor = (game: GameKey, mode: Mode): Audience =>
  GAMES[game].audiences.find((a) => a.mode === mode) ?? GAMES.quiz.audiences.find((a) => a.mode === mode)!;
