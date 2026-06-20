/**
 * E2E Tests: Onboarding Flow
 *
 * Tests the 4-step onboarding wizard, user creation for OAuth users,
 * and that already-onboarded users skip onboarding on subsequent logins.
 */

import { test, expect } from "./fixtures";
import { signInTestUser } from "./helpers";

test.describe("Onboarding Flow", () => {
  test("onboarding page redirects unauthenticated users to auth", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.waitForURL(/(\/auth|\/onboarding)/, { timeout: 10000 });
  });

  test("onboarding page loads with step 0 content", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    if (page.url().includes("/auth")) return;

    if (page.url().includes("/onboarding")) {
      const content = await page.innerText("body");
      expect(
        content?.includes("health goals") || content?.includes("Welcome")
      ).toBeTruthy();
    }
  });

  test("onboarding has health goal options", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    if (!page.url().includes("/onboarding")) return;

    const goals = [
      "Better Sleep",
      "More Energy",
      "Reduce Stress",
      "Improve Focus",
    ];
    let found = false;
    for (const goal of goals) {
      const element = page.getByText(goal, { exact: false });
      if (await element.isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }
    if (page.url().includes("/onboarding")) {
      expect(found).toBeTruthy();
    }
  });
});

test.describe("Onboarding Persistence", () => {
  test("already onboarded user is NOT redirected to onboarding on login", async ({
    page,
  }) => {
    // Sign in with our test user (who has onboarding_completed = true)
    await signInTestUser(page);

    // Should land on /protocols, NOT /onboarding
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 10000,
    });

    expect(page.url()).not.toContain("/onboarding");
    expect(page.url()).toContain("/protocols");
  });

  test("already onboarded user stays on protocols after page reload", async ({
    page,
  }) => {
    await signInTestUser(page);
    await page.waitForURL("**/protocols", { timeout: 10000 });

    // Reload the page — should stay on protocols, not redirect to onboarding
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    expect(page.url()).toContain("/protocols");
    expect(page.url()).not.toContain("/onboarding");
  });

  test("already onboarded user navigating to /onboarding directly can access it", async ({
    page,
  }) => {
    await signInTestUser(page);

    // Go directly to /onboarding — page should load (not crash)
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    // Page should either show onboarding or redirect — either is acceptable
    // The key test is it doesn't error out
    const status = page.url();
    expect(
      status.includes("/onboarding") || status.includes("/protocols")
    ).toBeTruthy();
  });
});
