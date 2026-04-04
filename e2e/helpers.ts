/**
 * E2E Test Helpers
 *
 * Shared utilities for authentication, test data, and common actions.
 */

import { Page, expect } from "@playwright/test";

// Test user credentials — uses a dedicated test account
export const TEST_USER = {
  email: "e2e-test@craftwell.app",
  password: "TestPass123!",
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
 * Sign in with email/password via the auth page.
 *
 * Includes retry logic — if the first sign-in attempt results in a
 * redirect back to /auth (e.g. session cookie race in CI), we retry
 * once before giving up.
 */
export async function signInTestUser(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // page.goto can itself throw net::ERR_ABORTED in CI under load;
      // wrapping the full flow in the try ensures it is properly retried.
      await page.goto("/auth", { waitUntil: "domcontentloaded" });

      // Default tab is "Sign In", but click it explicitly for reliability
      await clickAuthTab(page, "Sign In");
      await page.getByLabel("Email").fill(TEST_USER.email);
      await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
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
      if (attempt === 2) throw new Error("signInTestUser: failed after 3 attempts");
      // Brief pause before retry to let the server recover
      await page.waitForTimeout(1500);
    }
  }
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
