import { expect, test } from "@playwright/test";
import { E2E_ADMIN_TOKEN } from "./env";
import { closeExtraPhones, expectAccessible, lobby } from "./helpers";

test.afterEach(closeExtraPhones);

test("the metrics page needs the admin token, then shows the numbers", async ({ browser, page }) => {
  // Something to count.
  await lobby(browser, "Couple", ["Ana"]);

  await page.goto("/admin/metrics");
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByText("Decision metrics")).toHaveCount(0);
  await expectAccessible(page);

  await page.getByLabel("Admin token").fill("not-the-right-token");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That token isn't right.")).toBeVisible();

  await page.getByLabel("Admin token").fill(E2E_ADMIN_TOKEN);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Decision metrics" })).toBeVisible();
  await expect(page.getByText("Created a room")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mutation Machine" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Last 30 days" }).click();
  await expect(page.getByRole("link", { name: "Last 30 days" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Run cleanup now" }).click();
  await expect(page.getByText(/Done: removed \d+ rooms/)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByLabel("Admin token")).toBeVisible();
});

test("admin endpoints refuse anyone without the token", async ({ request }) => {
  expect((await request.post("/api/admin/cleanup")).status()).toBe(401);
  const wrong = await request.post("/api/admin/cleanup", { headers: { authorization: "Bearer nope-nope-nope-nope" } });
  expect(wrong.status()).toBe(401);
  const right = await request.post("/api/admin/cleanup", { headers: { authorization: `Bearer ${E2E_ADMIN_TOKEN}` } });
  expect(right.status()).toBe(200);
  expect(await right.json()).toMatchObject({ rooms: expect.any(Number), events: expect.any(Number) });
});
