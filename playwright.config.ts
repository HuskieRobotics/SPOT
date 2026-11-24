import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_PASSWORD } from "./tests/e2e/fixtures";

const port = Number(process.env.PORT || 3000);

export { E2E_ADMIN_PASSWORD };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    // Scouters primarily use personal phones (docs/spec/02, NF-1); test the mobile viewport first.
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Expects `npm run build` to have run (CI does); locally reuses a running server. Starts an
    // in-memory MongoDB seeded with an active event, then `next start` (tests/e2e/server.ts).
    command: "npx tsx tests/e2e/server.ts",
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // the first run downloads mongod
    // A test-only value, not a secret: tests/e2e/admin-sign-in.spec.ts signs in with it.
    env: { SPOT_ADMIN_PASSWORD: process.env.SPOT_ADMIN_PASSWORD ?? E2E_ADMIN_PASSWORD },
  },
});
