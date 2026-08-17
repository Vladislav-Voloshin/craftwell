import { defineConfig, devices } from "@playwright/test";
import type { AuthOptions } from "./e2e/fixtures";

export default defineConfig<AuthOptions>({
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
    // ── Smoke tests (01–07) — don't depend on saved auth ───────────────────
    // Auth spec (02) deliberately tests unauthenticated flows.
    // Other smoke specs (01, 03–07) call signInTestUser() themselves.
    // fullyParallel: false prevents concurrent sign-ins that would exhaust
    // Supabase auth rate limits across parallel workers.
    {
      name: "smoke",
      testMatch: /0[1-7]-.*\.spec\.ts/,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },

    // ── Full suite — each parallel worker authenticates as its OWN account ──
    // `workerAuth: true` activates the per-worker storageState fixture
    // (e2e/fixtures.ts): every worker signs in as e2e-test+w{parallelIndex} once
    // and reuses that session, so Supabase refresh-token rotation in one worker
    // can't invalidate another's (the cause of the prior /auth-redirect flakes).
    // Excludes 02-auth.spec.ts which tests unauthenticated flows — already
    // covered by the smoke project and would fail here because every context is
    // pre-authenticated.
    {
      name: "full",
      testIgnore: /02-auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        workerAuth: true,
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
