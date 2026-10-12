import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeExtraPhones, expectAccessible, expectPhoneFriendly, newPlayer } from "./helpers";

test.afterEach(closeExtraPhones);

/** Chain Reactions · Mutation Machine (UsVsUs 4.2 Sprint 1), behind CHAIN_REACTIONS=on. */

async function chaosRoom(browser: Browser, kind: "Duo" | "Circle", guests: string[]) {
  const host = await newPlayer(browser);
  await host.goto("/");
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
  await expect(page.getByText(`Step ${step} of 5`).or(page.getByText(/the reveal/))).toBeVisible();
  const done = page.getByRole("heading", { name: "Done!" }).or(page.getByText(/the reveal/));
  for (let i = 0; i < 4; i++) {
    // Finishing a step can move everyone straight on: stop at the step boundary.
    if (!(await page.getByText(`Step ${step} of 5`).isVisible())) return;
    const create = page.getByRole("heading", { name: /^Draw this:/ });
    const mutate = page.getByRole("heading", { name: "Mutate this machine" });
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
    await expect.poll(async () => (await done.isVisible()) || (await heading.textContent()) !== before).toBe(true);
  }
  await expect(done).toBeVisible();
}

async function playAllSteps(phones: Page[], style: (i: number) => Style, marker: (i: number) => string) {
  for (let step = 1; step <= 5; step++) {
    await expect(phones[0].getByText(`Step ${step} of 5`).or(phones[0].getByText(/the reveal/))).toBeVisible();
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
  await expect(host.getByText(/the reveal/)).toBeVisible();
  await revealToRecap(host, phones);
});
