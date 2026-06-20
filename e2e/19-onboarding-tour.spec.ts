import { test, expect } from "./fixtures";
import { ensureAuthenticated } from "./helpers";

test.describe("Onboarding Tour", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    // Clear tour state
    await page.evaluate(() => localStorage.removeItem("craftwell_tour_completed"));
  });

  test("shows tour overlay when visiting protocols with tour param", async ({ page }) => {
    await page.goto("/protocols?tour=1");
    await page.waitForLoadState("domcontentloaded");

    // Tour should appear after a short delay
    await expect(page.getByText("Browse Protocols")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("science-based health protocols")).toBeVisible();
  });

  test("can navigate through all tour steps", async ({ page }) => {
    await page.goto("/protocols?tour=1");
    await page.waitForLoadState("domcontentloaded");

    // Step 1: Protocols
    await expect(page.getByText("Browse Protocols")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 2: Chat
    await expect(page.getByText("Ask the AI Coach")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 3: Profile
    await expect(page.getByText("Track Your Progress")).toBeVisible();
    await page.getByRole("button", { name: "Got it!" }).click();

    // Tour should be dismissed
    await expect(page.getByText("Track Your Progress")).not.toBeVisible();
  });

  test("can skip the tour", async ({ page }) => {
    await page.goto("/protocols?tour=1");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Browse Protocols")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Skip" }).click();

    // Tour should be dismissed
    await expect(page.getByText("Browse Protocols").first()).not.toBeVisible({ timeout: 3000 });
  });

  test("does not show tour without tour param", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait a bit to make sure tour doesn't appear
    await page.waitForTimeout(1500);
    // The tour tooltip "Browse Protocols" title should not appear (the nav label "Protocols" will exist)
    const tourTooltip = page.locator("text=Ask the AI Coach");
    await expect(tourTooltip).not.toBeVisible();
  });

  test("does not show tour if already completed", async ({ page }) => {
    // Mark tour as completed
    await page.goto("/protocols");
    await page.evaluate(() => localStorage.setItem("craftwell_tour_completed", "true"));

    await page.goto("/protocols?tour=1");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const tourTooltip = page.locator("text=Ask the AI Coach");
    await expect(tourTooltip).not.toBeVisible();
  });
});

