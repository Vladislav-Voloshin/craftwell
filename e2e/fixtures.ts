/**
 * Per-worker authentication fixtures.
 *
 * Root cause of the `full`-suite flakiness: every parallel worker reused ONE
 * shared `storageState`. Supabase rotates refresh tokens, so when two workers
 * refreshed concurrently they invalidated each other's session — authenticated
 * pages then redirected to /auth (~8 flaky failures across 05/06/15/17).
 *
 * Fix: each worker signs in as its OWN seeded account
 * (e2e-test+w{parallelIndex}@craftwell.app) exactly once, persists that session
 * to a worker-specific storageState file, and reuses it for every test on that
 * worker. No two workers ever share a session, so there is no rotation race.
 *
 * Projects opt in via `use: { workerAuth: true }`. When the flag is off (the
 * `smoke` project, the unauthenticated `02-auth` spec, the `setup` project),
 * the `storageState` override is a no-op and behaviour is unchanged.
 */
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { AUTH_DIR, authFileForWorker } from "./auth-file";
import { signInAs, testUserForWorker } from "./helpers";

export type AuthOptions = {
  /** Opt-in: when true, this worker authenticates as its own account. */
  workerAuth: boolean;
};

type AuthWorkerFixtures = AuthOptions & {
  /** Absolute path to this worker's storageState file (created on first use). */
  workerStorageState: string | undefined;
};

// No custom TEST-scoped fixtures (we only override the built-in `storageState`
// option, which already lives in Playwright's base test args), so the first
// type param is an empty object. `workerAuth` is a WORKER-scoped option so the
// worker-scoped `workerStorageState` fixture can depend on it — a worker fixture
// cannot read a test-scoped fixture.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type NoTestFixtures = {};

export const test = base.extend<NoTestFixtures, AuthWorkerFixtures>({
  // Default off; the `full` project flips it on in playwright.config.ts.
  workerAuth: [false, { scope: "worker", option: true }],

  // Worker-scoped: runs at most once per worker. Signs the worker's user in via
  // the real /auth UI (so onboarding is handled the same way as before) and
  // saves the resulting Supabase session to .auth/user-${parallelIndex}.json.
  workerStorageState: [
    async ({ browser, workerAuth }, use, workerInfo) => {
      if (!workerAuth) {
        await use(undefined);
        return;
      }

      // parallelIndex is stable when Playwright restarts a failed worker;
      // workerIndex is not and can grow beyond the seeded account pool.
      const file = authFileForWorker(workerInfo.parallelIndex);
      const user = testUserForWorker(workerInfo.parallelIndex);

      if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

      // A context created from the raw `browser` does NOT inherit the project's
      // baseURL (only the built-in `page` fixture does), so relative goto("/…")
      // would fail with "invalid URL". Pass it through explicitly.
      const baseURL = workerInfo.project.use.baseURL ?? "http://localhost:3000";

      // Sign in with a throwaway context (reusing the battle-tested helper, which
      // handles React-hydration races, retries, and onboarding), then persist
      // the resulting Supabase session for every test on this worker to reuse.
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      try {
        await signInAs(page, user);
        await page.context().storageState({ path: file });
      } finally {
        await context.close();
      }

      await use(file);
    },
    { scope: "worker" },
  ],

  // Override the built-in storageState option with this worker's file. When
  // workerAuth is off, workerStorageState is undefined and Playwright falls
  // back to whatever the project configured (i.e. unchanged behaviour).
  // NOTE: the Playwright fixture callback's `use` argument trips the React Hooks
  // lint rule (it pattern-matches the name `use`); it is not a React hook.
  storageState: async ({ workerStorageState }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(workerStorageState);
  },
});

export { expect };
export type { APIRequestContext };
