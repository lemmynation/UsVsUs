import { expect, test } from "@playwright/test";
import { closeExtraPhones, expectPhoneFriendly, lobby, options, startGame } from "./helpers";

test.afterEach(closeExtraPhones);

/**
 * @layout specs also run on the small-phone projects in playwright.config.ts
 * (360×640 Android, iPhone SE): nothing scrolls sideways or shrinks below 44px.
 */

test("landing, create, join and privacy fit the phone @layout", async ({ page }) => {
  for (const path of ["/", "/create?mode=circle", "/join", "/privacy"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectPhoneFriendly(page);
  }
});

test("a full Circle lobby fits the phone @layout", async ({ browser }) => {
  test.setTimeout(90_000); // five phones join one by one; slow when the dev server is busy
  const { host } = await lobby(browser, "Circle", ["Anastasia", "Benjamin", "Catalina", "Dominic"]);
  await expect(host.getByTestId("player-count")).toHaveText("5/10");
  await expectPhoneFriendly(host);
});

test("question and reveal fit the phone @layout", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  await expectPhoneFriendly(host);
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(host).first()).toBeVisible();
  await expectPhoneFriendly(host);
  await options(host).first().click();
  await options(guests[0]).first().click();
  await expect(host.getByRole("list", { name: /^(Answers|Votes)$/ })).toBeVisible();
  await expectPhoneFriendly(host);
});
