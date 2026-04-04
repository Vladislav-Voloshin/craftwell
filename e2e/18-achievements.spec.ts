import { test, expect } from "@playwright/test";
import { ensureAuthenticated, gotoAuthenticated } from "./helpers";

test.describe("Profile Achievements", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("displays achievements section on profile page", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");

    // Should show Achievements card
    await expect(page.getByText("Achievements")).toBeVisible({ timeout: 10000 });
  });

  test("shows unlocked count", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");

    // Should show X/Y unlocked
    await expect(page.getByText(/\d+\/\d+ unlocked/)).toBeVisible({ timeout: 10000 });
  });

  test("shows achievement badges with icons", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");

    // Wait for achievements to load (replace skeleton)
    await expect(page.getByText("Achievements")).toBeVisible({ timeout: 10000 });

    // Should have achievement items with titles
    await expect(page.getByText("Getting Started")).toBeVisible();
    await expect(page.getByText("Day One")).toBeVisible();
    await expect(page.getByText("Curious Mind")).toBeVisible();
  });

  test("shows progress bars for locked achievements", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");

    await expect(page.getByText("Achievements")).toBeVisible({ timeout: 10000 });

    // Should have some progress indicators (current/target format)
    const progressTexts = page.locator("text=/\\d+\\/\\d+/");
    const count = await progressTexts.count();
    expect(count).toBeGreaterThan(0);
  });
});
