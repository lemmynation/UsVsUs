import { expect, test, type Page } from "@playwright/test";
import { answerFirst, closeExtraPhones, lobby, newPlayer, options, playToEnd, startGame } from "./helpers";

test.afterEach(closeExtraPhones);

/**
 * Multiplayer validation: whole matches with separate phones (each its own cookie),
 * including the paths real groups hit: wrong codes, a host who leaves, double taps,
 * rejoining and rematches.
 */

/** The numbers on a Game Score list, so phones can be compared ("You" differs per phone). */
async function scoresOn(page: Page) {
  const text = await page.getByRole("list", { name: "Final Game Score" }).innerText();
  return (text.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
}

test("Friends from the home page: wrong code, try again, play to Wrapped, both phones agree", async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await newPlayer(browser);
  await host.goto("/");
  const quiz = host.getByRole("article", { name: "Mind Match" });
  await quiz.getByText("How to play").click();
  await expect(quiz.getByText(/Share the link/)).toBeVisible();
  await quiz.getByRole("link", { name: "Play Mind Match" }).click();
  await expect(host.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await host.getByRole("link", { name: /^.?\s*Friends/ }).click();
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Create Friends room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();

  // The guest mistypes the code, recovers in one tap, then joins from the invite page.
  const guest = await newPlayer(browser);
  await guest.goto("/join");
  await guest.getByLabel("Room code").fill(code === "QQQQQQ" ? "WWWWWW" : "QQQQQQ");
  await guest.getByRole("button", { name: "Find room" }).click();
  await expect(guest.getByRole("heading", { name: "Room not found" })).toBeVisible();
  await guest.getByRole("link", { name: "Try another code" }).click();
  await guest.getByLabel("Room code").fill(code);
  await guest.getByRole("button", { name: "Find room" }).click();
  await expect(guest.getByRole("heading", { name: /Mind Match/ })).toBeVisible();
  await expect(guest.getByText("How to play")).toBeVisible();
  await guest.getByLabel("Your nickname").fill("Ana");
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest).toHaveURL(/\/room\//);

  // A guest who just joined shows as here, not away.
  await expect(host.getByRole("listitem").filter({ hasText: "Ana" })).toContainText("Here");

  await host.getByRole("button", { name: "Start game" }).click();
  await expect(guest.getByText("Round 1 of 3")).toBeVisible();
  // Two-player rounds need both phones to move through each question.
  for (let round = 1; round <= 3; round++) {
    await host.getByRole("button", { name: "Start round" }).click();
    for (let q = 1; q <= 5; q++) {
      await expect(host.getByText(`Round ${round} · Question ${q} of 5`)).toBeVisible();
      await answerFirst(host);
      await answerFirst(guest);
      await host.getByRole("button", { name: q < 5 ? "Next question" : "End round" }).click();
    }
    await host.getByRole("button", { name: round < 3 ? "Next round" : "Finish game" }).click();
  }
  for (const p of [host, guest]) await expect(p.getByRole("list", { name: "Final Game Score" })).toBeVisible();
  // Scores are locked in on the server: both phones show the same numbers.
  expect(await scoresOn(host)).toEqual(await scoresOn(guest));
  await expect(host.getByText(/Your team score/)).toBeVisible();
});

test("Circle: the host leaves mid-game, the next player takes over and the game finishes", async ({ browser }) => {
  test.setTimeout(300_000);
  const { host, guests, code } = await startGame(browser, "Circle", ["Ana", "Ben", "Cy"]);
  const [ana, ben, cy] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(ana).first()).toBeVisible();

  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Leave game" }).click();
  await expect(host).toHaveURL(/\/$/);

  // Ana joined first, so she hosts now and can run the rest of the game. (Wait until the
  // phones have dropped Lem from the vote: the stale-choice case has its own test.)
  for (const p of [ana, ben, cy]) await expect(options(p).filter({ hasText: "Lem" })).toHaveCount(0);
  await playToEnd(ana, [ana, ben, cy]);
  for (const p of [ana, ben, cy]) await expect(p.getByRole("heading", { name: "Tonight's awards" })).toBeVisible();

  // Rematch with whoever is left, and the old host can come back in with the code.
  await ana.getByRole("button", { name: /Rematch with this crew/ }).click();
  for (const p of [ana, ben, cy]) await expect(p.getByText(/Rematch!/)).toBeVisible();
  await host.goto(`/join/${code}`);
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Join room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  await expect(ana.getByTestId("player-count")).toHaveText("4/10");
  await ana.getByRole("button", { name: "Start game" }).click();
  for (const p of [ana, ben, cy, host]) await expect(p.getByText("Round 1 of 3")).toBeVisible();
});

test("voting for someone who just left explains itself and lets you pick again", async ({ browser }) => {
  const { host, guests, roomId } = await startGame(browser, "Circle", ["Ana", "Ben"]);
  const [ana] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(ana).filter({ hasText: "Lem" })).toHaveCount(1);
  // Freeze Ana's view of the room so she still sees Lem after he leaves.
  const frozen = new RegExp(`/api/rooms/${roomId}$`);
  await ana.route(frozen, (route) => (route.request().method() === "GET" ? route.abort() : route.continue()));
  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Leave game" }).click();
  await expect(host).toHaveURL(/\/$/);

  await options(ana).filter({ hasText: "Lem" }).click();
  await expect(ana.getByText("The choices just changed (someone left). Please pick again.")).toBeVisible();
  await ana.unroute(frozen);
  await expect(options(ana).filter({ hasText: "Lem" })).toHaveCount(0);
  await options(ana).first().click();
  await expect(ana.getByText(/Locked in!/)).toBeVisible();
});

test("a double-tapped answer locks in once, with no error", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await options(ana).first().dblclick();
  await expect(ana.getByText(/Locked in!|Now guess/).or(ana.getByRole("list", { name: /Answers/ }))).toBeVisible();
  if (await ana.getByText(/Now guess/).isVisible()) await options(ana, "Your guess").first().dblclick();
  await answerFirst(host);
  await expect(ana.getByRole("list", { name: /^(Answers|Votes)$/ })).toBeVisible();
  await expect(ana.locator("p[role=alert]")).toHaveCount(0);
  await expect(host.locator("p[role=alert]")).toHaveCount(0);
});

test("refreshing on the reveal and the scoreboard keeps everyone in step", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await answerFirst(host);
  await answerFirst(ana);
  await ana.reload();
  await expect(ana.getByRole("list", { name: /^(Answers|Votes)$/ })).toBeVisible();
  await host.reload();
  await expect(host.getByRole("button", { name: "Next question" })).toBeVisible();
  await host.getByRole("button", { name: "Next question" }).click();
  await expect(ana.getByText("Round 1 · Question 2 of 5")).toBeVisible();
});

test("the lobby explains the game to someone who came in by link", async ({ browser }) => {
  const { guests } = await lobby(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await expect(ana.getByText(/Mind Match:/)).toBeVisible();
  // (The invite page stays alive in the background, so pick the visible one.)
  await ana.locator("summary:visible", { hasText: "How to play" }).click();
  await expect(ana.locator("li:visible", { hasText: "Answers stay hidden until everyone's in" })).toBeVisible();
});
