import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // The dev server compiles each route on first use; too many phones at once starve it.
  workers: 3,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // Phones first: the reference viewport from the design doc is 390×844.
  projects: [{ name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium" } }],
  webServer: {
    // CI tests a production build: every route is compiled up front (dev compiles on first
    // use, which starved CI's small runners) and it's what real players get. Local runs use dev.
    command: process.env.CI ? `npx next build && npx next start --port ${PORT}` : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // In-memory rooms so E2E needs no database. Supabase-specific behaviour is covered separately.
    // Every simulated phone shares one IP, so per-IP rate limits are off for the test server only.
    env: { ROOM_STORE: "memory", PAYMENT_PROVIDER: "fake", RATE_LIMITS: "off" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // includes the build on CI
  },
});
