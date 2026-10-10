import { expect, test, type Page } from "@playwright/test";
import { closeExtraPhones, expectAccessible, options, startGame } from "./helpers";

test.afterEach(closeExtraPhones);

/** Engagement phase: Rematch + series score, reveal moments, live reactions. */

/** Answers whatever is open with the first option (and This or That's "guess" step). */
async function answerFirst(page: Page) {
  const done = page.getByText(/Locked in!/).or(page.getByRole("list", { name: /^(Answers|Votes)$/ }));
  await options(page).first().click();
  await expect(page.getByText(/Now guess/).or(done)).toBeVisible();
  if (await page.getByText(/Now guess/).isVisible()) await options(page, "Your guess").first().click();
  await expect(done).toBeVisible();
}

/** Plays a whole 2-player game from the round intro to Wrapped. Returns every prompt shown. */
async function playWholeGame(host: Page, guest: Page): Promise<Set<string>> {
  const prompts = new Set<string>();
  for (let round = 1; round <= 3; round++) {
    await host.getByRole("button", { name: "Start round" }).click();
    for (let q = 1; q <= 5; q++) {
      await expect(host.getByText(`Round ${round} · Question ${q} of 5`)).toBeVisible();
      prompts.add((await host.getByRole("heading", { level: 1 }).textContent())!);
      await answerFirst(host);
      await answerFirst(guest);
      await host.getByRole("button", { name: q < 5 ? "Next question" : "End round" }).click();
    }
    await host.getByRole("button", { name: round < 3 ? "Next round" : "Finish game" }).click();
  }
  await expect(host.getByText("Us Score")).toBeVisible();
  return prompts;
}

test("Rematch takes the same pair back to the lobby, with fresh questions and a series score", async ({ browser }) => {
  test.setTimeout(300_000);
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  const firstGame = await playWholeGame(host, ana);

  await expect(ana.getByText(/Waiting for Lem to start a rematch/)).toBeVisible();
  await expect(ana.getByRole("button", { name: /Rematch/ })).toHaveCount(0); // host decides
  const rematch = host.getByRole("button", { name: /Rematch with this crew/ });
  // Two taps at once: still one rematch, no error.
  await rematch.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  for (const p of [host, ana]) {
    await expect(p.getByText(/Same crew, fresh questions/)).toBeVisible();
    await expect(p.getByTestId("player-count")).toHaveText("2/2");
  }
  await expect(host.locator("p.text-destructive")).toHaveCount(0); // no error message

  await host.getByRole("button", { name: "Start game" }).click();
  await expect(ana.getByText("Round 1 of 3")).toBeVisible();
  const secondGame = await playWholeGame(host, ana);
  expect([...secondGame].filter((p) => firstGame.has(p))).toEqual([]); // nothing repeats

  // Two finished games: the series score appears on Wrapped.
  for (const p of [host, ana]) await expect(p.getByTestId("series")).toContainText(/series|tied/i);
  await expect(host.getByTestId("series")).toContainText("2 games in this room");
  await expectAccessible(host);
});

test("a reveal builds up with a drumroll, then celebrates whoever nailed it", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await host.getByRole("button", { name: "Start round" }).click();

  // Mind Reader about Lem: Lem answers, Ana guesses the same option → Ana scores.
  await options(host).first().click();
  await options(ana).first().click();
  await expect(ana.getByText("And the answer is…")).toBeVisible();
  await expect(ana.getByText(/Really picked/)).toBeVisible();

  await expect(ana.getByText("👑 You take the lead!")).toBeVisible();
  await expect(host.getByText("👑 Ana takes the lead!")).toBeVisible();
  await expect(ana.locator("canvas")).toHaveCount(1); // confetti for the one who nailed it
  await expect(host.locator("canvas")).toHaveCount(0); // the subject can't score on their own question
});

test("with reduced motion there's no drumroll or confetti, just the answers", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await ana.emulateMedia({ reducedMotion: "reduce" });
  await host.getByRole("button", { name: "Start round" }).click();
  const sawDrumroll = ana.waitForSelector("text=And the answer is…", { timeout: 3000 }).then(
    () => true,
    () => false,
  );
  await options(host).first().click();
  await options(ana).first().click();
  await expect(ana.getByText("👑 You take the lead!")).toBeVisible();
  expect(await sawDrumroll).toBe(false);
  await expect(ana.locator("canvas")).toHaveCount(0);
});

test("reactions float up on a reveal, and only when there's something to react to", async ({ browser }) => {
  const { host, guests, roomId } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;

  // Not during a question.
  const early = await ana.request.post(`/api/rooms/${roomId}/react`, { data: { emoji: "😂", nonce: "abcdefgh12" } });
  expect(early.status()).toBe(409);

  await host.getByRole("button", { name: "Start round" }).click();
  await options(host).first().click();
  await options(ana).first().click();
  const laugh = ana.getByRole("button", { name: "React: Laugh" });
  await expect(laugh).toBeVisible();
  await laugh.click();
  await expect(ana.locator(".float-reaction", { hasText: "😂" })).toBeVisible();

  // Only the fixed emoji list, and only from people in the room.
  const odd = await ana.request.post(`/api/rooms/${roomId}/react`, { data: { emoji: "🍕", nonce: "abcdefgh12" } });
  expect(odd.status()).toBe(400);
  const stranger = await (
    await browser.newContext()
  ).request.post(`/api/rooms/${roomId}/react`, {
    data: { emoji: "😂", nonce: "abcdefgh12" },
  });
  expect(stranger.status()).toBe(403);
  await expectAccessible(ana);
});
