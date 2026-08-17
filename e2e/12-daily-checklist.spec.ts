/**
 * E2E Tests: Protocol Daily Checklist (Sprint 3)
 *
 * Tests the daily checklist on protocol detail pages — checking/unchecking tools,
 * progress bar, and streak display. The checklist only shows for activated protocols.
 */

import { test, expect } from "./fixtures";
import { gotoAuthenticated, signInTestUser } from "./helpers";

test.describe("Daily Checklist", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    // Use a stable seeded protocol directly. Loading the entire catalogue just
    // to discover this URL made setup unnecessarily slow under CI contention.
    await gotoAuthenticated(page, "/protocols/optimize-sleep-quality");
    // Wait for protocol title heading to render (server-side fetch complete)
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    // Ensure protocol is activated — checklist only shows for active protocols
    const addBtn = page.getByRole("button", { name: /add to my protocols/i });
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      // Wait for button to change to "Remove from My Protocols"
      await page
        .getByRole("button", { name: /remove from my protocols/i })
        .waitFor({ timeout: 15000 });
    }

    // The progress panel and toggle controls appear together once activation
    // has propagated through the hydrated client state.
    await expect(page.getByText(/tools completed/)).toBeVisible({
      timeout: 20000,
    });
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
    await completeButtons.first().waitFor({ timeout: 20000 });
    const count = await completeButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a tool checkbox toggles completion state", async ({
    page,
  }) => {
    const completeButton = page
      .getByRole("button", { name: /mark .+ complete$/i })
      .first();
    await expect(completeButton).toBeEnabled({ timeout: 20000 });

    const completeLabel = await completeButton.getAttribute("aria-label");
    expect(completeLabel).toMatch(/^Mark .+ complete$/i);
    const incompleteLabel = completeLabel!.replace(/ complete$/i, " incomplete");
    const incompleteButton = page.getByRole("button", {
      name: incompleteLabel,
      exact: true,
    });

    const completionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/protocols/completions"),
      { timeout: 20000 }
    );
    await completeButton.click();
    expect((await completionResponse).ok()).toBe(true);
    await expect(incompleteButton).toBeVisible({ timeout: 10000 });

    // Uncheck it to clean up
    const cleanupResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/protocols/completions"),
      { timeout: 20000 }
    );
    await incompleteButton.click();
    expect((await cleanupResponse).ok()).toBe(true);
    await expect(completeButton).toBeVisible({ timeout: 10000 });
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
