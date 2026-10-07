import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Host creates a Couple room, partner joins, host starts. Returns both pages on the round intro. */
async function startCoupleGame(browser: Browser) {
  const host = await newPlayer(browser);
  await host.goto("/create?mode=couple");
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Create Couple room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();

  const guest = await newPlayer(browser);
  await guest.goto(`/join/${code}`);
  await guest.getByLabel("Your nickname").fill("Ana");
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest).toHaveURL(/\/room\//);

  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled();
  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, guest]) await expect(p.getByText("Round 1 of 3")).toBeVisible();
  return { host, guest, roomUrl: host.url() };
}

const answers = (page: Page) => page.getByRole("group", { name: "Answers" }).getByRole("button");

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

test("answers stay hidden until both are in, then both phones see the same reveal", async ({ browser }) => {
  const { host, guest, roomUrl } = await startCoupleGame(browser);
  await expect(guest.getByText(/Waiting for Lem to start the round/)).toBeVisible();
  await host.getByRole("button", { name: "Start round" }).click();

  const prompt = host.getByRole("heading", { level: 1 });
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText((await prompt.textContent())!);

  await answers(host).first().click();
  await expect(host.getByText(/Locked in!/)).toBeVisible();
  // The guest sees *that* Lem answered (no reload needed), not what.
  await expect(guest.getByText("1 of 2 answered")).toBeVisible();
  await expect(guest.getByText("✓ answered")).toBeVisible();

  // The guest's own API view must not contain the host's choice before the reveal.
  const roomId = roomUrl.split("/room/")[1];
  const peek = await guest.request.get(`/api/rooms/${roomId}`);
  const body = await peek.json();
  expect(body.game.phase).toBe("QUESTION_OPEN");
  expect(body.game.answeredPlayerIds).toHaveLength(1);
  expect(body.game.reveal).toBeNull();
  expect(body.game.myAnswer).toBeNull();

  await answers(guest).last().click();
  for (const p of [host, guest]) {
    await expect(p.getByText("Opposites attract 😅")).toBeVisible();
    await expect(p.getByText("You", { exact: true })).toBeVisible();
  }
});

test("refreshing mid-question keeps your locked-in answer", async ({ browser }) => {
  const { host, guest } = await startCoupleGame(browser);
  await host.getByRole("button", { name: "Start round" }).click();
  await answers(guest).first().click();
  await expect(guest.getByText(/Locked in!/)).toBeVisible();

  await guest.reload();
  await expect(guest.getByText(/Locked in!/)).toBeVisible();
  await expect(answers(guest).first()).toHaveAttribute("aria-pressed", "true");
});

test("a full game plays through every round to the end", async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, guest } = await startCoupleGame(browser);
  const prompts = new Set<string>();

  for (let round = 1; round <= 3; round++) {
    await host.getByRole("button", { name: "Start round" }).click();
    for (let q = 1; q <= 5; q++) {
      await expect(host.getByText(`Round ${round} · Question ${q} of 5`)).toBeVisible();
      prompts.add((await host.getByRole("heading", { level: 1 }).textContent())!);
      await expectPhoneFriendly(guest);
      await answers(host).first().click();
      await answers(guest).first().click();
      await expect(host.getByText("Same brain! 🧠")).toBeVisible();
      await expectPhoneFriendly(host);
      await host.getByRole("button", { name: q < 5 ? "Next question" : "End round" }).click();
    }
    await expect(guest.getByRole("heading", { name: `Round ${round} done!` })).toBeVisible();
    await host.getByRole("button", { name: round < 3 ? "Next round" : "Finish game" }).click();
  }

  for (const p of [host, guest]) await expect(p.getByRole("heading", { name: "That's a wrap!" })).toBeVisible();
  expect(prompts.size).toBe(15); // no repeats within a game
});
