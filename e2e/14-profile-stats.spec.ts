/**
 * E2E Tests: Profile Streaks & Stats (Sprint 3)
 *
 * Tests the streak tracking and completion statistics on the profile page.
 * Note: Streaks & Stats section only renders when the user has active protocols.
 */

import { test, expect } from "./fixtures";
import { signInTestUser, gotoAuthenticated, TEST_USER } from "./helpers";
import type { Page } from "@playwright/test";

async function profileHasActiveProtocols(page: Page) {
  const statsHeading = page.getByText("Streaks & Stats", { exact: true });
  const emptyState = page.getByText(/No active protocols yet/i);

  await expect
    .poll(
      async () =>
        (await statsHeading.isVisible().catch(() => false)) ||
        (await emptyState.isVisible().catch(() => false)),
      { timeout: 15000 }
    )
    .toBe(true);

  return statsHeading.isVisible();
}

test.describe("Profile Stats & Streaks", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/profile");
    // Wait for the profile to fully render (not just the loading skeleton)
    await page.getByText(TEST_USER.email).waitFor({ timeout: 15000 });
  });

  test("profile shows user email", async ({ page }) => {
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
  });

  test("profile shows Streaks & Stats section when protocols are active", async ({ page }) => {
    const body = page.locator("body");
    const hasActiveProtocols = await profileHasActiveProtocols(page);
    // Stats section is conditionally rendered — only when user has active protocols
    if (hasActiveProtocols) {
      await expect(body).toContainText(/Streak|Stats/i);
    } else {
      // Without active protocols, the protocol section shows "Browse Protocols" instead
      await expect(body).toContainText(/Browse Protocols|No active protocols/i);
    }
  });

  test("stats section shows Active Protocols count when protocols are active", async ({ page }) => {
    const body = page.locator("body");
    const hasActiveProtocols = await profileHasActiveProtocols(page);
    // Only assert the stat labels when the stats section is rendered
    if (hasActiveProtocols) {
      await expect(body).toContainText(/Active Protocols/i);
    } else {
      // Verify the protocol stack card renders even without active protocols
      await expect(body).toContainText(/Protocol Stack|protocol|Browse Protocols/i);
    }
  });

  test("stats section shows Total Days when protocols are active", async ({ page }) => {
    const body = page.locator("body");
    const hasActiveProtocols = await profileHasActiveProtocols(page);
    if (hasActiveProtocols) {
      await expect(body).toContainText(/Total Days/i);
    }
  });

  test("stats section shows Best Streak when protocols are active", async ({ page }) => {
    const body = page.locator("body");
    const hasActiveProtocols = await profileHasActiveProtocols(page);
    if (hasActiveProtocols) {
      await expect(body).toContainText(/Best Streak/i);
    }
  });

  test("health profile shows survey data", async ({ page }) => {
    // Should show health profile data from onboarding survey
    await expect(page.locator("body")).toContainText(
      /Health Profile|Sleep Quality|Stress Level|Goals/i
    );
  });

  test("member since date is displayed", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/Member since/i);
  });
});
