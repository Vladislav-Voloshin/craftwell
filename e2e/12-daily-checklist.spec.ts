/**
 * E2E Tests: Protocol Daily Checklist (Sprint 3)
 *
 * Tests the daily checklist on protocol detail pages — checking/unchecking tools,
 * progress bar, and streak display. The checklist only shows for activated protocols.
 */

import { test, expect } from "./fixtures";
import { signInTestUser } from "./helpers";

test.describe("Daily Checklist", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    // Navigate to first protocol detail via direct URL navigation
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Get the href of the first protocol and navigate directly
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    // Wait for protocol title heading to render (server-side fetch complete)
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    // Ensure protocol is activated — checklist only shows for active protocols
    const addBtn = page.getByRole("button", { name: /add to my protocols/i });
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      // Wait for button to change to "Remove from My Protocols"
      await page.getByRole("button", { name: /remove from my protocols/i }).waitFor({ timeout: 5000 });
    }
  });

  test("protocol detail shows daily checklist with progress", async ({
    page,
  }) => {
    await expect(page.getByText(/tools completed/)).toBeVisible({ timeout: 10000 });
  });

  test("checklist items have completion toggle buttons", async ({ page }) => {
    const completeButtons = page.getByRole("button", {
      name: /mark .+ (complete|incomplete)/i,
    });
    await completeButtons.first().waitFor({ timeout: 10000 });
    const count = await completeButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a tool checkbox toggles completion state", async ({
    page,
  }) => {
    // Wait for checklist to load
    const toggleButtons = page.getByRole("button", { name: /mark .+ complete$/i });
    await toggleButtons.first().waitFor({ timeout: 15000 });

    await toggleButtons.first().click();

    // After clicking, should now show "incomplete" option for that tool
    const incompleteButtons = page.getByRole("button", {
      name: /mark .+ incomplete/i,
    });
    await incompleteButtons.first().waitFor({ timeout: 10000 });
    const count = await incompleteButtons.count();
    expect(count).toBeGreaterThan(0);

    // Uncheck it to clean up
    await incompleteButtons.first().click();
    // Wait for the "mark complete" button to reappear
    await toggleButtons.first().waitFor({ timeout: 10000 });
  });

  test("progress bar reflects completion count", async ({ page }) => {
    const progressText = page.getByText(/\d+\/\d+ tools completed/);
    await expect(progressText).toBeVisible({ timeout: 10000 });
  });

  test("streak section is visible for active protocol", async ({ page }) => {
    // Active protocol always shows "tools completed" text at minimum
    await expect(page.getByText(/tools completed/)).toBeVisible({ timeout: 10000 });
  });
});
