import { expect, type Browser, type Page } from "@playwright/test";
import { newPlayer } from "./helpers";

/** Driving Mutation Machine phones (shared by chaos.spec.ts and party.spec.ts). */

export async function chaosRoom(browser: Browser, kind: "Duo" | "Circle", guests: string[]) {
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
export async function draw(page: Page, label: RegExp) {
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

export type Style = "draw" | "describe";

/** Does whatever this phone is asked to do until it's done with the step (or the reveal starts). */
export async function doJobs(page: Page, style: Style, marker: string, step: number) {
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

export async function playAllSteps(phones: Page[], style: (i: number) => Style, marker: (i: number) => string) {
  for (let step = 1; step <= 5; step++) {
    await expect(
      phones[0].getByText(`Step ${step} of 5`).or(phones[0].getByText(/Chain \d+ · the reveal/)),
    ).toBeVisible();
    for (const [i, p] of phones.entries()) await doJobs(p, style(i), marker(i), step);
  }
}

export async function revealToRecap(host: Page, phones: Page[]) {
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
