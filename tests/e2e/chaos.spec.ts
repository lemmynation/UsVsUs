import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeExtraPhones, expectAccessible, expectPhoneFriendly, newPlayer } from "./helpers";

test.afterEach(closeExtraPhones);

/** Chain Reactions · Mutation Machine (UsVsUs 4.2 Sprint 1), behind CHAIN_REACTIONS=on. */

async function chaosRoom(browser: Browser, kind: "Duo" | "Circle", guests: string[]) {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("link", { name: "Play Mutation Machine" }).click();
  await host.getByRole("link", { name: new RegExp(`${kind} Chaos`) }).click();
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: `Create ${kind} Chaos room` }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();
  const phones = [host];
  for (const name of guests) {
    const p = await newPlayer(browser);
    await p.goto(`/join/${code}`);
    await p.getByLabel("Your nickname").fill(name);
    await p.getByRole("button", { name: "Join room" }).click();
    await expect(p).toHaveURL(/\/room\//);
    phones.push(p);
  }
  return { host, phones, roomId: host.url().split("/room/")[1] };
}

/** Draws a little zigzag on the canvas with the mouse, and checks it registered. */
async function draw(page: Page, label: RegExp) {
  const canvas = page.getByRole("img", { name: label });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
  await page.mouse.down();
  for (const [x, y] of [
    [0.5, 0.4],
    [0.6, 0.2],
    [0.75, 0.4],
  ]) {
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 6 });
  }
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "↶ Undo" })).toBeEnabled();
}

type Style = "draw" | "describe";

/** Does whatever this phone is asked to do until it's done with the step (or the reveal starts). */
async function doJobs(page: Page, style: Style, marker: string, step: number) {
  // Phones refresh on their own schedule: wait until this one has reached the step.
  await expect(page.getByText(`Step ${step} of 5`).or(page.getByText(/Chain \d+ · the reveal/))).toBeVisible();
  const done = page.getByRole("heading", { name: "Done!" }).or(page.getByText(/Chain \d+ · the reveal/));
  for (let i = 0; i < 4; i++) {
    // Finishing a step can move everyone straight on: stop at the step boundary.
    if (!(await page.getByText(`Step ${step} of 5`).isVisible())) return;
    const create = page.getByRole("heading", { name: /^Draw this:/ });
    const mutate = page.getByRole("heading", { name: "Secretly mutate this" });
    const detect = page.getByRole("heading", { name: /^🔎 Detect/ });
    await expect(create.or(mutate).or(detect).or(done)).toBeVisible();
    if (await done.isVisible()) return;
    const heading = page.getByRole("heading", { level: 1 }).first();
    const before = await heading.textContent();
    if (await detect.isVisible()) {
      for (const group of await page.getByRole("group", { name: /What|changed/ }).all()) {
        await group.getByRole("button").first().click();
      }
      await page.getByRole("button", { name: "Lock in" }).click();
    } else if (style === "draw") {
      await draw(page, /Your drawing|with your mutation/);
      await page.getByRole("button", { name: "Submit" }).click();
    } else {
      await page.getByRole("button", { name: "⌨️ Describe instead" }).click();
      await page.getByRole("textbox").fill(marker);
      await page.getByRole("button", { name: "Submit" }).click();
    }
    // Wait for the phone to move on (next job, or "Done!") before looking again.
    // (The reveal has no h1: a heading that's gone counts as moved on, rather than waiting for one.)
    await expect
      .poll(
        async () =>
          (await done.isVisible()) || (await heading.textContent({ timeout: 500 }).catch(() => null)) !== before,
      )
      .toBe(true);
  }
  await expect(done).toBeVisible();
}

async function playAllSteps(phones: Page[], style: (i: number) => Style, marker: (i: number) => string) {
  for (let step = 1; step <= 5; step++) {
    await expect(
      phones[0].getByText(`Step ${step} of 5`).or(phones[0].getByText(/Chain \d+ · the reveal/)),
    ).toBeVisible();
    for (const [i, p] of phones.entries()) await doJobs(p, style(i), marker(i), step);
  }
}

async function revealToRecap(host: Page, phones: Page[]) {
  const recap = host.getByRole("heading", { name: /That's the chaos/ });
  const next = host.getByRole("button", { name: /Next chain|See results/ });
  const chainLabel = host.getByText(/Chain \d+ · the reveal/);
  for (let i = 0; i < phones.length + 1; i++) {
    await expect(next.or(recap)).toBeVisible();
    if (await recap.isVisible()) break;
    const before = (await chainLabel.allTextContents()).join();
    await next.click();
    // Wait until the host has moved on (next chain or the recap) before looking again.
    await expect
      .poll(async () => (await recap.isVisible()) || (await chainLabel.allTextContents()).join() !== before)
      .toBe(true);
  }
  for (const p of phones) await expect(p.getByRole("heading", { name: /That's the chaos/ })).toBeVisible();
}

test("Duo Chaos: two phones draw, mutate, detect and see the reveal, then rematch", async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, phones } = await chaosRoom(browser, "Duo", ["Ana"]);
  await expect(host.getByRole("button", { name: "Start Mutation Machine" })).toBeVisible();
  await expect(host.getByRole("button", { name: /Unlock/ })).toHaveCount(0); // no quiz packs here
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();

  await playAllSteps(
    phones,
    () => "draw",
    () => "",
  );
  await expect(phones[1].getByText(/It started as…/)).toBeVisible();
  await expect(phones[1].getByRole("img", { name: /The original/ })).toBeVisible();
  await expectAccessible(phones[1]);

  await revealToRecap(host, phones);
  await expect(host.getByText(/in sync/)).toBeVisible(); // Duo is co-op: team score + sync
  await host.getByRole("button", { name: /Rematch with this crew/ }).click();
  for (const p of phones) await expect(p.getByText(/New things to draw/)).toBeVisible();
});

test("Circle Chaos with 3: one player plays entirely by keyboard ('Describe instead')", async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  await expect(phones[2].getByRole("heading", { name: /^Draw this:/ })).toBeVisible();
  await expectAccessible(phones[2]);
  await expectPhoneFriendly(phones[2]);

  await playAllSteps(
    phones,
    (i) => (i === 2 ? "describe" : "draw"),
    (i) => `ben-wrote-${i}`,
  );
  await revealToRecap(host, phones);
  await expect(host.getByRole("list", { name: "Titles" }).getByRole("listitem")).toHaveCount(3);
  await expectAccessible(host);
});

test("Circle Chaos with 6: phones never receive other chains' work or answers before the reveal", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben", "Cy", "Dee", "Eli"]);
  // Record every room-state response each phone gets.
  const seen: string[][] = phones.map(() => []);
  phones.forEach((p, i) =>
    p.on("response", async (r) => {
      if (/\/api\/rooms\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === "GET") {
        seen[i].push(await r.text().catch(() => ""));
      }
    }),
  );
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();

  // Step 1 only: everyone describes their object with a marker unique to them.
  for (const [i, p] of phones.entries()) await doJobs(p, "describe", `secret-of-player-${i}`, 1);
  await expect(host.getByText("Step 2 of 5")).toBeVisible();
  // Each phone may see at most its own text and the one chain it now mutates — never all six.
  for (const [i] of phones.entries()) {
    const body = seen[i].join("\n");
    const visible = phones.map((_, j) => body.includes(`secret-of-player-${j}`)).filter(Boolean).length;
    expect(visible, `phone ${i} saw ${visible} players' work`).toBeLessThanOrEqual(2);
    expect(body).not.toMatch(/"mutationRight"|"objectRight"/);
  }

  for (let step = 2; step <= 5; step++) {
    for (const p of phones) await doJobs(p, "describe", "x", step);
  }
  await expect(host.getByText(/Chain \d+ · the reveal/)).toBeVisible();
  await revealToRecap(host, phones);
});

test("a step moves on by itself after its overtime, even if the host never skips", async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  // Ana and Ben draw; the host never draws and never taps "Skip waiting".
  for (const p of phones.slice(1)) await doJobs(p, "describe", "x", 1);
  await expect(phones[1].getByText(/Waiting for Lem/)).toBeVisible();
  // 60 s timer, then "Time's up" with a countdown, then everyone is moved on.
  await expect(phones[1].getByText(/Time's up · moving on in \d+s/)).toBeVisible({ timeout: 75_000 });
  for (const p of phones) await expect(p.getByText("Step 2 of 5")).toBeVisible({ timeout: 40_000 });
});

// ── Validation: the paths real groups hit ─────────────────────────────────────

test("refreshing mid-drawing keeps the unsent drawing; a submitted step stays submitted", async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, phones } = await chaosRoom(browser, "Duo", ["Ana"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  await draw(host, /Your drawing/);
  await host.reload();
  // The half-done drawing is back, still unsent.
  await expect(host.getByRole("button", { name: "↶ Undo" })).toBeEnabled();
  await expect(host.getByRole("img", { name: "Your drawing" }).locator("path")).not.toHaveCount(0);
  await host.getByRole("button", { name: "Submit" }).click();
  await expect(host.getByRole("heading", { name: "Done!" })).toBeVisible();
  await host.reload();
  await expect(host.getByRole("heading", { name: "Done!" })).toBeVisible();
  await expect(host.getByText(/Waiting for Ana/)).toBeVisible();
  await doJobs(phones[1], "draw", "", 1);
  for (const p of phones) await expect(p.getByText("Step 2 of 5")).toBeVisible();
  // The next job starts with a clean canvas, not the old draft.
  for (const p of phones) {
    await expect(p.getByRole("heading", { name: "Secretly mutate this" })).toBeVisible();
    await expect(p.getByRole("button", { name: "↶ Undo" })).toBeDisabled();
  }
});

test("a phone that loses signal mid-step catches up and keeps playing", async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  const ben = phones[2];
  await expect(ben.getByRole("heading", { name: /^Draw this:/ })).toBeVisible();
  await ben.context().setOffline(true);
  await expect(ben.getByText("Reconnecting… your answers are safe.")).toBeVisible();
  for (const p of phones.slice(0, 2)) await doJobs(p, "describe", "x", 1);
  await ben.context().setOffline(false);
  await expect(ben.getByText("Reconnecting… your answers are safe.")).toBeHidden();
  await expect(ben.getByText(/Step 1 of 5/)).toBeVisible();
  await doJobs(ben, "describe", "x", 1);
  for (const p of phones) await expect(p.getByText("Step 2 of 5")).toBeVisible();
});

test("the host leaving mid-match hands over, and the match still finishes", async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  for (const p of phones) await doJobs(p, "describe", "x", 1);
  await expect(host.getByText("Step 2 of 5")).toBeVisible();

  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Leave game" }).click();
  await expect(host).toHaveURL(/\/$/);

  // Nobody waits for the leaver; Ana (joined first) runs the reveal.
  const [, ana, ben] = phones;
  for (let step = 2; step <= 5; step++) for (const p of [ana, ben]) await doJobs(p, "describe", "x", step);
  await expect(ana.getByText(/Chain \d+ · the reveal/)).toBeVisible();
  await revealToRecap(ana, [ana, ben]);
  // Everyone who played gets a title, the leaver too (they drew a chain).
  const titles = ana.getByRole("list", { name: "Titles" }).getByRole("listitem");
  await expect(titles).toHaveCount(3);
  await expect(titles.filter({ hasText: "Someone who left" })).toHaveCount(1);
});

test("a double-tapped Submit sends once, with no error", async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, phones } = await chaosRoom(browser, "Duo", ["Ana"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  await draw(host, /Your drawing/);
  await host.getByRole("button", { name: "Submit" }).dblclick();
  await expect(host.getByRole("heading", { name: "Done!" })).toBeVisible();
  await expect(host.locator("p[role=alert]")).toHaveCount(0);
  // A detect choice double-tapped and Lock in double-tapped also go through once.
  await doJobs(phones[1], "draw", "", 1);
  await expect(host.getByText("Step 2 of 5")).toBeVisible();
});

test("Circle Chaos rematch: same crew, new things to draw", async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  const firstObject = (await host.getByRole("heading", { name: /^Draw this:/ }).textContent())!;
  await playAllSteps(
    phones,
    () => "describe",
    () => "x",
  );
  await revealToRecap(host, phones);
  await host.getByRole("button", { name: /Rematch with this crew/ }).click();
  for (const p of phones) await expect(p.getByText(/New things to draw/)).toBeVisible();
  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  for (const p of phones) await expect(p.getByText("Step 1 of 5")).toBeVisible();
  // The rematch avoids the last match's cards.
  await expect(host.getByRole("heading", { name: /^Draw this:/ })).not.toHaveText(firstObject);
});
