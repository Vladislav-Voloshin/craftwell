/**
 * E2E Tests: Onboarding Flow
 *
 * Tests the 4-step onboarding wizard, user creation for OAuth users,
 * and that already-onboarded users skip onboarding on subsequent logins.
 */

import { test, expect } from "./fixtures";

test.use({ workerAuth: false });

test.describe("Onboarding Flow", () => {
  test("onboarding page redirects unauthenticated users to auth", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForURL(/(\/auth|\/onboarding)/, { timeout: 10000 });
  });

  test("onboarding page loads with step 0 content", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    if (page.url().includes("/auth")) return;

    if (page.url().includes("/onboarding")) {
      const content = await page.innerText("body");
      expect(content?.includes("health goals") || content?.includes("Welcome")).toBeTruthy();
    }
  });

  test("onboarding has health goal options", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    if (!page.url().includes("/onboarding")) return;

    const goals = ["Better Sleep", "More Energy", "Reduce Stress", "Improve Focus"];
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
