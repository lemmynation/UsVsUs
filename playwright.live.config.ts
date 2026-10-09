import { defineConfig, devices } from "@playwright/test";

/**
 * Beta test against a deployed site (no local server):
 *   LIVE_URL=https://us-vs-us-chi.vercel.app npx playwright test --config playwright.live.config.ts
 * One phone at a time so production's rate limits (10 new rooms a minute per network) aren't hit.
 * Leaves out premium (hidden in production) and admin login (needs the real admin token).
 * Creates real rooms in the production database; they expire on their own.
 */
const baseURL = process.env.LIVE_URL;
if (!baseURL) throw new Error("Set LIVE_URL, e.g. LIVE_URL=https://us-vs-us-chi.vercel.app");

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: ["**/premium.spec.ts", "**/admin.spec.ts"],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: { timeout: 15_000 },
  timeout: 240_000,
  reporter: "list",
  outputDir: "test-results-live",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    {
      name: "small-android",
      grep: /@layout/,
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 }, browserName: "chromium" },
    },
    { name: "iphone-se", grep: /@layout/, use: { ...devices["iPhone SE"], browserName: "chromium" } },
  ],
});
