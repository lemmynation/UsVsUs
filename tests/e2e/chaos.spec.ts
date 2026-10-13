import { expect, test } from "@playwright/test";
import { chaosRoom, doJobs, draw, playAllSteps, revealToRecap } from "./chaos-helpers";
import { closeExtraPhones, expectAccessible, expectPhoneFriendly } from "./helpers";

test.afterEach(closeExtraPhones);

/** Chain Reactions · Mutation Machine (UsVsUs 4.2 Sprint 1), behind CHAIN_REACTIONS=on. */

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
