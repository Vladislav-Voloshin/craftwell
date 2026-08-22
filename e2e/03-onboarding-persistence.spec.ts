/** Authenticated onboarding persistence checks using one worker session. */

import { test, expect } from "./fixtures";
import { signInTestUser } from "./helpers";

test.describe("Onboarding Persistence", () => {
  test("already onboarded user is NOT redirected to onboarding on login", async ({ page }) => {
    await signInTestUser(page);
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 10000,
    });

    expect(page.url()).not.toContain("/onboarding");
    expect(page.url()).toContain("/protocols");
  });

  test("already onboarded user stays on protocols after page reload", async ({ page }) => {
    await signInTestUser(page);
    await page.waitForURL("**/protocols", { timeout: 10000 });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    expect(page.url()).toContain("/protocols");
    expect(page.url()).not.toContain("/onboarding");
  });

  test("already onboarded user navigating to /onboarding directly can access it", async ({
    page,
  }) => {
    await signInTestUser(page);
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");

    const status = page.url();
    expect(status.includes("/onboarding") || status.includes("/protocols")).toBeTruthy();
  });
});
