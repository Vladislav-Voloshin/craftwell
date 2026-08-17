/**
 * E2E Test Helpers
 *
 * Shared utilities for authentication, test data, and common actions.
 */

import { Page, expect, test } from "@playwright/test";

// Shared password for every seeded E2E account (see scripts/seed-e2e-user.mjs).
export const TEST_PASSWORD = "TestPass123!";

/**
 * Credentials for a specific parallel worker's dedicated account.
 *
 * Worker 0 → e2e-test+w0@craftwell.app, worker 1 → e2e-test+w1@…, etc.
 * Each worker owning its own account is what prevents Supabase refresh-token
 * rotation from invalidating sibling workers' sessions.
 */
export function testUserForWorker(parallelIndex: number) {
  return {
    email: `e2e-test+w${parallelIndex}@craftwell.app`,
    password: TEST_PASSWORD,
  };
}

/**
 * The current worker's credentials.
 *
 * `TEST_USER` is a getter so it resolves lazily against `test.info()` at the
 * moment of use — that keeps existing call sites (`TEST_USER.email`,
 * `signInTestUser(page)`) working while transparently giving every worker its
 * own account. Falls back to the base shared account when no worker context is
 * available (e.g. outside a running test).
 */
function currentTestUser() {
  let parallelIndex = 0;
  try {
    parallelIndex = test.info().parallelIndex;
  } catch {
    // Not inside a test (no worker context) — use the base shared account.
    return { email: "e2e-test@craftwell.app", password: TEST_PASSWORD };
  }
  return testUserForWorker(parallelIndex);
}

// Test user credentials — resolves to the running worker's dedicated account.
export const TEST_USER: { readonly email: string; readonly password: string } = {
  get email() {
    return currentTestUser().email;
  },
  get password() {
    return currentTestUser().password;
  },
};

/**
 * Click a segmented-control tab button (Sign In / Sign Up).
 * These are plain <button> elements inside a `.bg-muted.p-1` container,
 * NOT role="tab" — the auth page uses a custom segmented control.
 */
async function clickAuthTab(page: Page, label: "Sign In" | "Sign Up") {
  await page.locator(".bg-muted.p-1 button", { hasText: label }).click();
}

/**
 * Sign up a new test user via the auth page
 */
export async function signUpTestUser(page: Page) {
  await page.goto("/auth");
  await clickAuthTab(page, "Sign Up");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel(/Password/).fill(TEST_USER.password);
  await page.getByRole("button", { name: "Create Account" }).click();
}

/**
 * Robustly fill a React-controlled input.
 *
 * The auth form's inputs are controlled (value/onChange). If we type before
 * React has hydrated and attached the onChange handler, the value is dropped
 * and the form reports "Email is required" on submit. So we fill, then verify
 * the DOM value actually stuck, retrying a few times — this is what makes the
 * sign-in deterministic instead of flaky.
 */
async function fillControlled(
  page: Page,
  getInput: () => ReturnType<Page["getByLabel"]>,
  value: string
) {
  for (let i = 0; i < 5; i++) {
    const input = getInput();
    await input.fill(value);
    if ((await input.inputValue()) === value) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`fillControlled: input never retained value "${value}"`);
}

/**
 * Core sign-in flow for an arbitrary account. Used by both signInTestUser()
 * (the per-worker default) and the worker auth fixture (e2e/fixtures.ts).
 *
 * Includes retry logic — if a sign-in attempt results in a redirect back to
 * /auth (e.g. session cookie race) or the controlled inputs drop their value,
 * we retry before giving up.
 */
export async function signInAs(
  page: Page,
  user: { email: string; password: string }
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // page.goto can itself throw net::ERR_ABORTED in CI under load;
      // wrapping the full flow in the try ensures it is properly retried.
      await page.goto("/auth", { waitUntil: "domcontentloaded" });

      // Default tab is "Sign In", but click it explicitly for reliability
      await clickAuthTab(page, "Sign In");
      await fillControlled(page, () => page.getByLabel("Email"), user.email);
      await fillControlled(
        page,
        () => page.getByLabel("Password", { exact: true }),
        user.password
      );
      // Two "Sign In" buttons exist: segmented control (.bg-muted) and form submit.
      // Use .last() to target the submit button.
      await page.getByRole("button", { name: "Sign In" }).last().click();

      // Wait for redirect away from /auth
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 12000,
      });

      // If redirected to onboarding, complete it so tests land on /protocols
      if (page.url().includes("/onboarding")) {
        await completeOnboarding(page);
      }

      return; // success
    } catch {
      if (attempt === 2)
        throw new Error(`signInAs(${user.email}): failed after 3 attempts`);
      // Brief pause before retry to let the server recover
      await page.waitForTimeout(1500);
    }
  }
}

/**
 * Sign in with the current worker's dedicated test account via the auth page.
 */
export async function signInTestUser(page: Page) {
  await signInAs(page, { email: TEST_USER.email, password: TEST_USER.password });
}

/**
 * Navigate to a protected page, re-authenticating if redirected to /auth.
 * Retries on net::ERR_ABORTED (CI flakiness) and handles session expiry.
 * Use this instead of bare page.goto() for authenticated routes.
 */
export async function gotoAuthenticated(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // If we got redirected to /auth, the session expired — re-auth and retry
      if (page.url().includes("/auth")) {
        await signInTestUser(page);
        await page.goto(path, { waitUntil: "domcontentloaded" });
      }

      // Final check — if still on /auth something is fundamentally wrong
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 10000,
      });
      return; // success
    } catch {
      if (attempt === 2) throw new Error(`gotoAuthenticated(${path}): failed after 3 attempts`);
      await page.waitForTimeout(1500);
    }
  }
}

/**
 * Sign in and complete onboarding if needed
 */
export async function signInAndOnboard(page: Page) {
  await signInTestUser(page);

  // If redirected to onboarding, complete it
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page);
  }
}

/**
 * Complete the onboarding wizard.
 * Handles both the legacy 4-step flow and the current 2-step flow (PB-174).
 */
export async function completeOnboarding(page: Page) {
  // Step 1 — always present: Health goals + (2-step) or just goals (4-step)
  await page.waitForSelector("text=What are your health goals", { timeout: 10000 });
  await page.getByText("Better Sleep").click();
  await page.getByText("More Energy").click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — detect which flow we're on
  await page.waitForLoadState("domcontentloaded");
  const bodyText = await page.innerText("body");

  if (bodyText.includes("Quick preferences") || bodyText.includes("Sleep quality")) {
    // 2-step flow: step 2 is Quick Preferences (sleep/stress/exercise/supplements)
    // Sliders default to 5 — just advance
    await page.getByRole("button", { name: /start exploring/i }).click();
  } else if (bodyText.includes("sleep") || bodyText.includes("Sleep")) {
    // 4-step flow: step 2 is Sleep/Stress, advance through remaining steps
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForLoadState("domcontentloaded");
    // Step 3: Exercise/Supplements
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForLoadState("domcontentloaded");
    // Step 4: Focus areas
    await page.getByText("Sleep").first().click();
    await page.getByRole("button", { name: /start exploring|finish/i }).click();
  } else {
    // Fallback — just try to finish
    await page.getByRole("button", { name: /start exploring|finish|next/i }).click();
  }

  // Wait for redirect to /protocols
  await page.waitForURL("**/protocols", { timeout: 15000 });
}

/**
 * Ensure user is authenticated and on the app (past onboarding)
 */
export async function ensureAuthenticated(page: Page) {
  await signInAndOnboard(page);
  // Should be on /protocols or somewhere in the app
  await expect(page).not.toHaveURL(/\/auth/);
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/auth", { timeout: 10000 });
}

/**
 * Wait for page to be fully loaded (no network activity)
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("domcontentloaded");
}
