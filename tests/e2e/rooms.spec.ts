import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeExtraPhones } from "./helpers";

test.afterEach(closeExtraPhones);

/** Each player gets their own browser context = their own phone and cookie. */
async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function hostRoom(page: Page, mode: "Couple" | "Friends" | "Circle", nickname: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(`^.?\\s*${mode}(?! Chaos)`) }).click();
  await page.getByLabel("Your nickname").fill(nickname);
  await page.getByRole("button", { name: `Create ${mode} room` }).click();
  await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}$/);
  return (await page.getByTestId("join-code").textContent())!.trim();
}

async function joinRoom(page: Page, code: string, nickname: string) {
  await page.goto(`/join/${code}`);
  await page.getByLabel("Your nickname").fill(nickname);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}$/);
}

test("couple: host creates, partner joins by link, host starts", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await hostRoom(host, "Couple", "Lem");
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

  const start = host.getByRole("button", { name: "Start game" });
  await expect(start).toBeDisabled();
  await expect(host.getByText("Waiting for 1 more player to join.")).toBeVisible();

  const guest = await newPlayer(browser);
  await joinRoom(guest, code, "Ana");
  await expect(guest.getByText("Ana (you)")).toBeVisible();
  await expect(guest.getByText(/Waiting for Lem to start/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Start game" })).toHaveCount(0);

  // Host's lobby updates without a reload.
  await expect(host.getByTestId("player-count")).toHaveText("2/2");
  await expect(start).toBeEnabled();
  await start.click();

  await expect(host.getByText("Round 1 of 3")).toBeVisible();
  await expect(guest.getByText("Round 1 of 3")).toBeVisible();
});

test("circle: needs 3 players before the host can start", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await hostRoom(host, "Circle", "Lem");

  await joinRoom(await newPlayer(browser), code, "Ana");
  await expect(host.getByTestId("player-count")).toHaveText("2/10");
  await expect(host.getByRole("button", { name: "Start game" })).toBeDisabled();

  await joinRoom(await newPlayer(browser), code, "Ben");
  await expect(host.getByTestId("player-count")).toHaveText("3/10");
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled();
});

test("a full room explains itself to a third visitor", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await hostRoom(host, "Friends", "Lem");
  await joinRoom(await newPlayer(browser), code, "Ana");

  const late = await newPlayer(browser);
  await late.goto(`/join/${code}`);
  await expect(late.getByRole("heading", { name: "Room is full" })).toBeVisible();
});

test("a double-tap on Start just starts the game, with no error", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await hostRoom(host, "Couple", "Lem");
  await joinRoom(await newPlayer(browser), code, "Ana");
  const start = host.getByRole("button", { name: "Start game" });
  await expect(start).toBeEnabled();
  // Two taps in the same instant — before React can re-render and disable the button.
  await start.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(host.getByText("Round 1 of 3")).toBeVisible();
  await expect(host.getByRole("alert").filter({ hasText: /already started|went wrong/i })).toHaveCount(0);
});

test("refreshing keeps you in the room", async ({ browser }) => {
  const host = await newPlayer(browser);
  await hostRoom(host, "Couple", "Lem");
  const url = host.url();

  await host.reload();
  await expect(host).toHaveURL(url);
  await expect(host.getByText("Lem (you)")).toBeVisible();
});

test("join with code: rejects malformed and unknown codes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Join with code" }).click();

  await page.getByLabel("Room code").fill("abc");
  await page.getByRole("button", { name: "Find room" }).click();
  await expect(page.getByText(/Room codes are 6 letters and numbers/)).toBeVisible();

  await page.getByLabel("Room code").fill("zzzz zz");
  await page.getByRole("button", { name: "Find room" }).click();
  await expect(page).toHaveURL(/\/join\/ZZZZZZ$/);
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
});
