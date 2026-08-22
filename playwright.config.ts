import { defineConfig, devices } from "@playwright/test";
import type { AuthOptions } from "./e2e/fixtures";

export default defineConfig<AuthOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Hosted Supabase Auth rate-limits password grants per IP. A single CI worker
  // creates one reusable session and avoids both login bursts and SSR contention.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // ── Smoke tests (01–07) ─────────────────────────────────────────────────
    // Auth, landing, and public onboarding specs opt out at file scope. The
    // authenticated smoke specs reuse one worker session instead of signing in
    // independently. Serial execution prevents hosted Auth login bursts.
    {
      name: "smoke",
      testMatch: /0[1-7]-.*\.spec\.ts/,
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        workerAuth: true,
      },
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
