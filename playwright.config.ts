import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_TOKEN } from "./tests/e2e/env";

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
  // Phones first: the reference viewport from the design doc is 390×844. Specs tagged @layout
  // also run on small phones, where overflow and cramped buttons show up first.
  projects: [
    { name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    {
      name: "small-android",
      grep: /@layout/,
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 }, browserName: "chromium" },
    },
    { name: "iphone-se", grep: /@layout/, use: { ...devices["iPhone SE"], browserName: "chromium" } },
  ],
  webServer: {
    // CI tests a production build: every route is compiled up front (dev compiles on first
    // use, which starved CI's small runners) and it's what real players get. Local runs use dev.
    command: process.env.CI ? `npx next build && npx next start --port ${PORT}` : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // In-memory rooms so E2E needs no database. Supabase-specific behaviour is covered separately.
    // Every simulated phone shares one IP, so per-IP rate limits are off for the test server only.
    env: {
      ROOM_STORE: "memory",
      PAYMENT_PROVIDER: "fake",
      RATE_LIMITS: "off",
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      // E2E_CHAIN_REACTIONS=off runs the suite the way production runs today.
      CHAIN_REACTIONS: process.env.E2E_CHAIN_REACTIONS ?? "on",
      // Party Screen (TV) rides on Chain Reactions; E2E_PARTY_SCREEN=off hides it.
      PARTY_SCREEN: process.env.E2E_PARTY_SCREEN ?? "on",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // includes the build on CI
  },
});
