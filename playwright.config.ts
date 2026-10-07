import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
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
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // In-memory rooms so E2E needs no database. Supabase-specific behaviour is covered separately.
    env: { ROOM_STORE: "memory" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
