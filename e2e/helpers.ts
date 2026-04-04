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
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/auth");
    // Default tab is "Sign In", but click it explicitly for clarity
    await clickAuthTab(page, "Sign In");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    // Two "Sign In" buttons exist: segmented control (.bg-muted) and form submit.
    // Use .last() to target the submit button.
    await page.getByRole("button", { name: "Sign In" }).last().click();

    try {
      // Wait for redirect away from /auth
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 10000,
      });

      // If redirected to onboarding, complete it so tests land on /protocols
      if (page.url().includes("/onboarding")) {
        await completeOnboarding(page);
      }

      return; // success
    } catch {
      if (attempt === 1) throw new Error("signInTestUser: failed after 2 attempts");
      // Retry on next iteration
    }
  }
}

/**
 * Navigate to a protected page, re-authenticating if redirected to /auth.
 * Use this instead of bare page.goto() for authenticated routes.
 */
export async function gotoAuthenticated(page: Page, path: string) {
  await page.goto(path);

  // If we got redirected to /auth, the session expired — re-auth and retry
  if (page.url().includes("/auth")) {
    await signInTestUser(page);
    await page.goto(path);
  }

  // Final check — if still on /auth something is fundamentally wrong
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 10000,
  });
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
 * Complete the 4-step onboarding wizard
 */
export async function completeOnboarding(page: Page) {
  // Step 0: Health goals — click at least one
  await page.waitForSelector("text=What are your health goals");
  await page.getByText("Better Sleep").click();
  await page.getByText("More Energy").click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 1: Sleep quality + Stress level (sliders default to middle, just advance)
  await page.waitForSelector("text=sleep");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: Exercise frequency + Supplement experience
  await page.waitForSelector("text=exercise");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: Focus areas
  await page.waitForSelector("text=focus");
  await page.getByText("Sleep").click();
  await page.getByText("Nutrition").click();
  await page.getByRole("button", { name: /start exploring|finish/i }).click();

  // Wait for redirect to /protocols
  await page.waitForURL("**/protocols", { timeout: 10000 });
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
