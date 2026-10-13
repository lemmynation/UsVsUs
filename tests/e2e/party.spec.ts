import { expect, test, type Browser, type Page } from "@playwright/test";
import { chaosRoom, playAllSteps, revealToRecap } from "./chaos-helpers";
import { closeExtraPhones, expectAccessible } from "./helpers";

test.afterEach(closeExtraPhones);

/** Party Screen (UsVsUs 4.2 Sprint 2): a TV as spectator, behind PARTY_SCREEN=on. */

async function newTv(browser: Browser) {
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto("/party");
  await expect(tv.getByRole("heading", { name: "Connect this screen" })).toBeVisible();
  const code = (await tv.getByTestId("tv-code").textContent())!.trim();
  return { tv, code };
}

async function connectTv(host: Page, code: string) {
  await host.getByRole("button", { name: "Connect a TV" }).click();
  await host.getByLabel("TV code").fill(code);
  await host.getByRole("button", { name: "Connect", exact: true }).click();
}

test("6 phones + 1 TV play a whole match; the TV never receives anything private", async ({ browser }) => {
  test.setTimeout(360_000);
  const { tv, code } = await newTv(browser);
  const seen: string[] = [];
  tv.on("response", async (r) => {
    if (r.url().endsWith("/api/party/me")) seen.push(await r.text().catch(() => ""));
  });

  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben", "Cy", "Dee", "Eli"]);
  await connectTv(host, code);
  await expect(host.getByText("Connected! The TV shows the lobby now.")).toBeVisible();

  // The TV shows the lobby: QR to the normal join link, everyone who's in.
  await expect(tv.getByText("Waiting for Lem to start…")).toBeVisible();
  await expect(tv.getByRole("img", { name: /QR code to join room/ })).toBeVisible();
  await expect(tv.getByRole("list", { name: "Players" }).getByRole("listitem")).toHaveCount(6);
  await expectAccessible(tv);
  await expect(host.getByText("TV 1 · showing the game")).toBeVisible({ timeout: 15_000 });

  await host.getByRole("button", { name: "Start Mutation Machine" }).click();
  await expect(tv.getByRole("heading", { name: /Draw your thing/ })).toBeVisible();
  await expect(tv.getByText("Step 1 of 5")).toBeVisible();
  await expect(tv.getByText("0 of 6 in")).toBeVisible();

  // Everyone writes a marker unique to them; the TV must never get it before the reveal.
  await playAllSteps(
    phones,
    () => "describe",
    (i) => `secret-of-player-${i}`,
  );
  await expect(tv.getByText(/Chain 1 of 6 · the reveal/)).toBeVisible();
  const beforeReveal = seen.slice(0, -3).join("\n"); // allow for responses that raced the reveal
  expect(beforeReveal).not.toMatch(/secret-of-player-/);
  expect(beforeReveal).not.toMatch(/myJobs|waitingOn|Choices|drawHint|"mine"|Right"|sessionTokenHash|tokenHash/);
  expect(beforeReveal).not.toContain(code);
  await expect(tv.getByText(/secret-of-player-/).first()).toBeVisible();
  await expectAccessible(tv);

  await revealToRecap(host, phones);
  await expect(tv.getByRole("heading", { name: /That's the chaos/ })).toBeVisible();
  await expect(tv.getByRole("list", { name: "Titles" }).getByRole("listitem")).toHaveCount(6);
});

test("pairing: host only, wrong codes refused, disconnecting sends the TV back to a new code", async ({ browser }) => {
  test.setTimeout(120_000);
  const { tv, code } = await newTv(browser);
  await expectAccessible(tv);
  const { host, phones } = await chaosRoom(browser, "Circle", ["Ana", "Ben"]);
  await expect(phones[1].getByRole("button", { name: "Connect a TV" })).toHaveCount(0);

  await connectTv(host, "ZZZ ZZZ");
  await expect(host.getByText(/That TV code didn't work/)).toBeVisible();
  await host.getByLabel("TV code").fill(code.toLowerCase());
  await host.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(tv.getByText("Waiting for Lem to start…")).toBeVisible();

  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Disconnect TV 1" }).click();
  await expect(host.getByText("TV 1 disconnected.")).toBeVisible();
  await expect(tv.getByText("The host disconnected this screen.")).toBeVisible();
  await expect(tv.getByTestId("tv-code")).not.toHaveText(code);

  // The old code is spent; the TV's new one works.
  await host.getByLabel("TV code").fill(code);
  await host.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(host.getByText(/That TV code didn't work/)).toBeVisible();
  await host.getByLabel("TV code").fill((await tv.getByTestId("tv-code").textContent())!);
  await host.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(tv.getByText("Waiting for Lem to start…")).toBeVisible();
});
