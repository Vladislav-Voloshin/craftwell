/**
 * E2E Tests: Theme Toggle (Sprint 3)
 *
 * Tests dark/light mode switching via the theme toggle button in the header.
 */

import { test, expect } from "./fixtures";
import { signInTestUser } from "./helpers";

test.describe("Theme Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");
  });

  test("theme toggle button is visible in header", async ({ page }) => {
    const toggleBtn = page.getByRole("button", { name: /toggle theme/i });
    await expect(toggleBtn).toBeVisible();
  });

  test("clicking theme toggle changes the theme class on html", async ({
    page,
  }) => {
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");
    const wasDark = initialClass?.includes("dark");

    const toggleBtn = page.getByRole("button", { name: /toggle theme/i });
    await toggleBtn.click();

    // Wait for theme class to change on the html element
    if (wasDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }

    const newClass = await html.getAttribute("class");
    const isDark = newClass?.includes("dark");

    // Theme should have toggled
    expect(isDark).not.toBe(wasDark);
  });

  test("toggling theme twice returns to original theme", async ({ page }) => {
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");

    const toggleBtn = page.getByRole("button", { name: /toggle theme/i });
    const wasDark = initialClass?.includes("dark");

    await toggleBtn.click();
    // Wait for first toggle to take effect
    if (wasDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }

    await toggleBtn.click();
    // Wait for second toggle to restore original theme
    if (wasDark) {
      await expect(html).toHaveClass(/dark/);
    } else {
      await expect(html).not.toHaveClass(/dark/);
    }

    const finalClass = await html.getAttribute("class");
    expect(finalClass?.includes("dark")).toBe(initialClass?.includes("dark"));
  });
});
