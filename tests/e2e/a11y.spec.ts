import { expect, test } from "@playwright/test";
import { closeExtraPhones, expectAccessible, newPlayer, options, startGame } from "./helpers";

test.afterEach(closeExtraPhones);

/** Design doc §16: every screen passes an automated WCAG A/AA scan. */

for (const path of ["/", "/create?mode=couple", "/join", "/privacy"]) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectAccessible(page);
  });
}

test("lobby and join-by-link have no serious accessibility problems", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/create?mode=couple");
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Create Couple room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();
  await expectAccessible(host); // lobby

  const guest = await newPlayer(browser);
  await guest.goto(`/join/${code}`);
  await expect(guest.getByLabel("Your nickname")).toBeVisible();
  await expectAccessible(guest); // join by link
});

test("in-game screens have no serious accessibility problems", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  await expectAccessible(host); // round intro

  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(host).first()).toBeVisible();
  await expectAccessible(host); // question
  await expectAccessible(guests[0]);

  await options(host).first().click();
  await options(guests[0]).first().click();
  await expect(host.getByRole("list", { name: /^(Answers|Votes)$/ })).toBeVisible();
  await expectAccessible(host); // reveal
});

test("the keyboard alone can create a room, with visible focus", async ({ page }) => {
  await page.goto("/create?mode=friends");
  await page.getByLabel("Your nickname").focus();
  await page.keyboard.type("Lem");
  await page.keyboard.press("Tab"); // room name
  await page.keyboard.press("Tab"); // create button
  const submit = page.getByRole("button", { name: "Create Friends room" });
  await expect(submit).toBeFocused();
  const visibleFocus = await submit.evaluate((el) => {
    const s = getComputedStyle(el);
    return (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
  });
  expect(visibleFocus).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/room\//);
});
