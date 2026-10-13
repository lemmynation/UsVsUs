import { describe, expect, it } from "vitest";
import { audienceFor, createHref, GAMES, gameForExperience } from "@/lib/games";
import { MODE_RULES } from "@/lib/rooms/rules";

describe("home games", () => {
  it("maps each room experience back to its game", () => {
    expect(gameForExperience("quick_party").key).toBe("quiz");
    expect(gameForExperience("chain_reactions").key).toBe("chaos");
    for (const game of Object.values(GAMES)) expect(gameForExperience(game.experience)).toBe(game);
  });

  it("quotes the real player counts for each audience", () => {
    for (const game of Object.values(GAMES)) {
      for (const a of game.audiences) {
        const { minPlayers, maxPlayers } = MODE_RULES[a.mode];
        expect(a.players).toBe(
          minPlayers === maxPlayers ? `${minPlayers} players` : `${minPlayers}–${maxPlayers} players`,
        );
      }
    }
  });

  it("builds create links that keep old ?mode= links meaning Mind Match", () => {
    expect(createHref("quiz")).toBe("/create?game=quiz");
    expect(createHref("chaos", "circle")).toBe("/create?game=chaos&mode=circle");
  });

  it("labels a room by its game's audience, falling back to the Mind Match one", () => {
    expect(audienceFor("chaos", "friends").label).toBe("Duo Chaos");
    expect(audienceFor("quiz", "circle").label).toBe("Circle");
    // Mutation Machine has no Couple option, but a room like that must still render.
    expect(audienceFor("chaos", "couple").label).toBe("Couple");
  });
});
