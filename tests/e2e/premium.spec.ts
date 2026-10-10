import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeExtraPhones } from "./helpers";

test.afterEach(closeExtraPhones);

/** Uses the fake payment provider (PAYMENT_PROVIDER=fake in playwright.config.ts). */
async function newPlayer(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function circleLobby(browser: Browser) {
  const host = await newPlayer(browser);
  await host.goto("/create?mode=circle");
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Create Circle room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();
  const guests: Page[] = [];
  for (const name of ["Ana", "Ben"]) {
    const g = await newPlayer(browser);
    await g.goto(`/join/${code}`);
    await g.getByLabel("Your nickname").fill(name);
    await g.getByRole("button", { name: "Join room" }).click();
    await expect(g).toHaveURL(/\/room\//);
    guests.push(g);
  }
  return { host, guests, roomId: host.url().split("/room/")[1] };
}

test("host unlocks Chaos Night for the whole room and plays it", async ({ browser }) => {
  const { host, guests } = await circleLobby(browser);
  await expect(host.getByText("Choose your game")).toBeVisible();
  await expect(guests[0].getByText("Choose your game")).toHaveCount(0); // host decides

  await host.getByRole("button", { name: "Unlock for ₱99" }).click();
  await expect(host).toHaveURL(/\/dev\/fake-checkout\//, { timeout: 20_000 }); // first visit compiles in dev
  await expect(host.getByText("Test checkout — no real money moves.")).toBeVisible();
  await host.getByRole("button", { name: "Pay ₱99 (test)" }).click();

  await expect(host.getByText("🎉 Unlocked for everyone in this room!")).toBeVisible();
  await expect(host).toHaveURL(/\/room\/[0-9a-f-]+$/); // ?checkout=success cleaned up
  for (const g of guests) await expect(g.getByText(/Chaos Night unlocked for this room/)).toBeVisible();

  // The new pack is picked automatically.
  await expect(host.getByRole("radio", { name: /Chaos Night/ })).toHaveAttribute("aria-checked", "true");
  await host.getByRole("button", { name: "Start Chaos Night" }).click();
  for (const p of [host, ...guests]) {
    await expect(p.getByText("🌪️ Chaos Night")).toBeVisible();
    await expect(p.getByText("Round 1 of 4")).toBeVisible();
  }
});

test("cancelling checkout leaves the pack locked and says no charge", async ({ browser }) => {
  const { host } = await circleLobby(browser);
  await host.getByRole("button", { name: "Unlock for ₱99" }).click();
  await host.getByRole("button", { name: "Cancel" }).click();
  await expect(host.getByText("Payment cancelled — you weren't charged.")).toBeVisible();
  await expect(host.getByRole("button", { name: "Unlock for ₱99" })).toBeVisible();
  await expect(host.getByRole("radio", { name: /Free game/ })).toHaveAttribute("aria-checked", "true");
});

test("the server refuses guests' checkouts, locked packs and forged webhooks", async ({ browser }) => {
  const { guests, roomId, host } = await circleLobby(browser);
  const asGuest = await guests[0].request.post(`/api/rooms/${roomId}/checkout`, { data: { packSlug: "chaos-night" } });
  expect(asGuest.status()).toBe(403);
  const lockedStart = await host.request.post(`/api/rooms/${roomId}/start`, { data: { packSlug: "chaos-night" } });
  expect(await lockedStart.json()).toMatchObject({ error: "pack_locked" });
  const forged = await host.request.post("/api/payments/webhook", {
    data: { eventId: "evt_forged", checkoutId: "anything" },
  });
  expect(forged.status()).toBe(401);
});
