import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE } from "./e2e/auth-file";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // ── Auth setup — runs once, saves session to .auth/user.json ────────────
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Smoke tests (01–07) — don't depend on saved auth ───────────────────
    // Auth spec (02) deliberately tests unauthenticated flows — no storageState.
    // Other smoke specs (01, 03–07) call signInTestUser() themselves.
    {
      name: "smoke",
      testMatch: /0[1-7]-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Full suite — reuses saved auth session across all workers ───────────
    // Tests that call signInTestUser() still work (they detect the session or
    // re-auth if it's expired). Tests that only use gotoAuthenticated() get
    // a fast path via the stored session.
    {
      name: "full",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "npx next start" : "npm run build && npx next start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
