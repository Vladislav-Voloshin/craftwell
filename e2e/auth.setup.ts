/**
 * Playwright auth setup — runs once before all tests.
 *
 * Signs in with the shared E2E test account and saves the Supabase session
 * cookies to .auth/user.json so tests can reuse the session via storageState
 * instead of signing in on every test (which causes sign-in race conditions
 * across parallel workers and quadruples auth API traffic).
 *
 * See PB-159.
 */
import { test as setup, expect } from "@playwright/test";
import { TEST_USER } from "./helpers";
import path from "path";

export const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

setup("authenticate test user", async ({ page }) => {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });

  // Click Sign In tab (default, but explicit for reliability)
  await page.locator(".bg-muted.p-1 button", { hasText: "Sign In" }).click();

  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).last().click();

  // Wait for redirect away from /auth
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 15000,
  });

  // If redirected to onboarding complete it
  if (page.url().includes("/onboarding")) {
    await page.waitForSelector("text=What are your health goals", {
      timeout: 10000,
    });
    await page.getByText("Better Sleep").click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: /start exploring/i }).click();
    await page.waitForURL("**/protocols", { timeout: 15000 });
  }

  // Confirm we landed on an app page
  await expect(page).not.toHaveURL(/\/auth/);

  // Save auth cookies/localStorage — reused by all workers via storageState
  await page.context().storageState({ path: AUTH_FILE });
});
