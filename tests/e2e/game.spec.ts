import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectAccessible } from "./helpers";

async function newPlayer(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Host creates a room, guests join, host starts. Returns everyone on the round intro. */
async function startGame(browser: Browser, mode: "Couple" | "Circle", guestNames: string[]) {
  const host = await newPlayer(browser);
  await host.goto(`/create?mode=${mode.toLowerCase()}`);
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: `Create ${mode} room` }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();

  const guests: Page[] = [];
  for (const name of guestNames) {
    const guest = await newPlayer(browser);
    await guest.goto(`/join/${code}`);
    await guest.getByLabel("Your nickname").fill(name);
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest).toHaveURL(/\/room\//);
    guests.push(guest);
  }

  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled();
  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, ...guests]) await expect(p.getByText("Round 1 of 3")).toBeVisible();
  return { host, guests, roomId: host.url().split("/room/")[1] };
}

const options = (page: Page, group = "Answers") => page.getByRole("group", { name: group }).getByRole("button");

/** Answers whatever is open with the first option, including This or That's second "guess" tap. */
async function answerFirst(page: Page) {
  // The last player to answer skips "Locked in" and lands straight on the reveal.
  const done = page.getByText(/Locked in!/).or(page.getByRole("list", { name: /^(Answers|Votes)$/ }));
  await options(page).first().click();
  await expect(page.getByText(/Now guess/).or(done)).toBeVisible();
  if (await page.getByText(/Now guess/).isVisible()) await options(page, "Your guess").first().click();
  await expect(done).toBeVisible();
}

/** Phone layout guard: no sideways scrolling and no tap target under 44px. */
async function expectPhoneFriendly(page: Page) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    smallTargets: [...document.querySelectorAll("button")]
      .filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44)
      .map((b) => b.textContent),
  }));
  expect(layout).toEqual({ overflow: false, smallTargets: [] });
}

test("Mind Reader: the guess stays hidden until both are in, then both phones see the same reveal", async ({
  browser,
}) => {
  const { host, guests, roomId } = await startGame(browser, "Couple", ["Ana"]);
  const [guest] = guests;
  await expect(host.getByRole("heading", { name: "Mind Reader" })).toBeVisible();
  await host.getByRole("button", { name: "Start round" }).click();

  // Lem joined first, so the first question is about Lem; Ana guesses.
  await expect(host.getByText(/It's about you/)).toBeVisible();
  await expect(guest.getByText("Guess what Lem picks")).toBeVisible();

  await options(host).first().click();
  await expect(guest.getByText("1 of 2 answered")).toBeVisible();

  // The guesser's own API view must not contain the subject's answer.
  const body = await (await guest.request.get(`/api/rooms/${roomId}`)).json();
  expect(body.game.phase).toBe("QUESTION_OPEN");
  expect(body.game.reveal).toBeNull();
  expect(body.game.myAnswer).toBeNull();
  expect(JSON.stringify(body)).not.toContain('"optionId"');

  await options(guest).first().click(); // same option → correct guess
  for (const p of [host, guest]) {
    await expect(p.getByText("Mind reader! 🔮")).toBeVisible();
    await expect(p.getByText("+100")).toBeVisible();
  }
});

test("refreshing mid-question keeps your locked-in answer", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [guest] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await options(guest).first().click();
  await expect(guest.getByText(/Locked in!/)).toBeVisible();

  await guest.reload();
  await expect(guest.getByText(/Locked in!/)).toBeVisible();
  await expect(options(guest).first()).toHaveAttribute("aria-pressed", "true");
});

test("Couple: a full game through all three game types ends with a Game Score winner", async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [guest] = guests;
  const prompts = new Set<string>();
  const roundTitles = ["Mind Reader", "This or That", "Who's More Likely"];

  for (let round = 1; round <= 3; round++) {
    await expect(host.getByRole("heading", { name: roundTitles[round - 1] })).toBeVisible();
    await host.getByRole("button", { name: "Start round" }).click();
    for (let q = 1; q <= 5; q++) {
      await expect(host.getByText(`Round ${round} · Question ${q} of 5`)).toBeVisible();
      prompts.add((await host.getByRole("heading", { level: 1 }).textContent())!);
      await expectPhoneFriendly(guest);
      await answerFirst(host);
      await answerFirst(guest);
      const next = host.getByRole("button", { name: q < 5 ? "Next question" : "End round" });
      await expect(next).toBeVisible();
      await expectPhoneFriendly(host);
      await next.click();
    }
    await expect(guest.getByRole("heading", { name: `Round ${round} done!` })).toBeVisible();
    await expect(guest.getByRole("list", { name: "Game Score" })).toBeVisible();
    await host.getByRole("button", { name: round < 3 ? "Next round" : "Finish game" }).click();
  }

  // Ana guessed 3 Mind Reader questions to Lem's 2, so Ana wins (925 to 825).
  await expect(guest.getByRole("heading", { name: "You win! 🏆" })).toBeVisible();
  await expect(host.getByRole("heading", { name: "Ana wins! 🏆" })).toBeVisible();
  await expect(host.getByText("925")).toBeVisible();
  expect(prompts.size).toBe(15); // no repeats within a game

  // Wrapped: every guess matched, so the Us Score is 100, with a round-by-round breakdown.
  for (const p of [host, guest]) {
    await expect(p.getByText("Us Score")).toBeVisible();
    await expect(p.getByText("100/100")).toBeVisible();
    await expect(p.getByRole("list", { name: "Rounds" }).getByRole("listitem")).toHaveCount(3);
    await expect(p.getByRole("link", { name: "Save image" })).toBeVisible();
  }
  await expectWrappedFits(guest);
  await expectShareCard(host);
  await expectShareSheetGetsCard(host);
});

/**
 * With a share sheet available (stubbed: headless browsers have none), the card
 * is ready before the tap and handed straight to navigator.share — Safari only
 * opens the sheet directly from a tap, so no download may happen in between.
 */
async function expectShareSheetGetsCard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: Array<{ name: string; type: string; size: number }> };
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        w.__shared = (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size }));
      },
    });
  });
  await page.reload();
  const share = page.getByRole("button", { name: "Share results" });
  await expect(share).toBeEnabled(); // card prefetched
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await share.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: unknown[] }).__shared))
    .toEqual([{ name: "us-vs-us-wrapped.png", type: "image/png", size: expect.any(Number) }]);
  expect(requests.filter((u) => u.includes("/wrapped/image"))).toEqual([]); // nothing fetched on tap
}

/** Wrapped fits common phone widths: no sideways scroll, no small tap targets. */
async function expectWrappedFits(page: Page) {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expectPhoneFriendly(page);
  }
}

/** The share card is a 1080×1920 PNG, and only for people in the room. */
async function expectShareCard(page: Page) {
  const href = (await page.getByRole("link", { name: "Save image" }).getAttribute("href"))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  // PNG IHDR: width and height are big-endian at bytes 16 and 20.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);

  const stranger = await page.context().browser()!.newContext();
  expect((await stranger.request.get(new URL(href, page.url()).toString())).status()).toBe(403);
  await stranger.close();
}

test("Circle: anonymous Who's More Likely votes hand out a badge", async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, guests } = await startGame(browser, "Circle", ["Ana", "Ben"]);
  await expect(host.getByRole("heading", { name: "Who's More Likely" })).toBeVisible();
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(host.getByText("Your vote is anonymous.")).toBeVisible();

  // Everyone votes for the first player listed (Lem).
  for (const p of [host, ...guests]) await answerFirst(p);
  for (const p of [host, ...guests]) {
    await expect(p.getByText(/🏆 .+ → (You|Lem)/)).toBeVisible();
    await expect(p.getByText("3 votes · 100%")).toBeVisible();
  }
  await expectPhoneFriendly(guests[1]);
});

test("Circle: a full game ends on Wrapped with the night's awards", async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, guests } = await startGame(browser, "Circle", ["Ana", "Ben"]);
  const everyone = [host, ...guests];

  for (let round = 1; round <= 3; round++) {
    await host.getByRole("button", { name: "Start round" }).click();
    for (let q = 1; q <= 5; q++) {
      await expect(host.getByText(`Round ${round} · Question ${q} of 5`)).toBeVisible();
      for (const p of everyone) await answerFirst(p);
      await host.getByRole("button", { name: q < 5 ? "Next question" : "End round" }).click();
    }
    await host.getByRole("button", { name: round < 3 ? "Next round" : "Finish game" }).click();
  }

  for (const p of everyone) {
    await expect(p.getByRole("heading", { name: "That's a wrap!" })).toBeVisible();
    await expect(p.getByRole("heading", { name: "Tonight's awards" })).toBeVisible();
  }
  // Everyone voted for the first player listed (Lem) every time.
  await expect(guests[0].getByRole("list", { name: "Awards" }).getByRole("listitem").first()).toContainText("Lem");
  await expect(host.getByText("Us Score")).toHaveCount(0); // Circle plays for badges, not points
  await expectWrappedFits(guests[1]);
  await expectShareCard(guests[0]);

  await expectAccessible(guests[0]); // Wrapped, with the feedback card

  // Beta feedback: one tap saves the rating, a comment is optional, and it isn't asked again.
  const [ana] = guests;
  const rate = ana.getByRole("group", { name: "How was the game?" });
  await rate.getByRole("button", { name: /Loved it/ }).click();
  await expect(rate.getByRole("button", { name: /Loved it/ })).toHaveAttribute("aria-pressed", "true");
  await ana.getByLabel(/Anything we should know/).fill("The awards were hilarious");
  await ana.getByRole("button", { name: "Send" }).click();
  await expect(ana.getByText("Thanks for the feedback! 💜")).toBeVisible();
  await ana.reload();
  await expect(ana.getByText("Thanks for the feedback! 💜")).toBeVisible();
  await expect(ana.getByRole("group", { name: "How was the game?" })).toHaveCount(0);
  await expect(host.getByRole("group", { name: "How was the game?" })).toBeVisible(); // each phone asks its own player
});
