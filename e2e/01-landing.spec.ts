/**
 * E2E Tests: Landing Page
 *
 * Tests the public landing page (/) — hero, CTAs, navigation.
 */

import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("displays hero section with Craftwell branding", async ({ page }) => {
    await page.goto("/");

    // Check branding (first() — Craftwell appears in nav + footer)
    await expect(page.getByText("Craftwell").first()).toBeVisible();

    // Check hero content
    await expect(
      page.getByRole("heading").first()
    ).toBeVisible();
  });

  test("has Get Started CTA linking to auth", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: /get started/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test("has Browse Protocols link", async ({ page }) => {
    await page.goto("/");

    const link = page.getByRole("link", { name: /browse protocols|protocols/i });
    await expect(link).toBeVisible();
    await link.click();
    // May redirect to auth if not logged in
    await page.waitForURL(/(\/protocols|\/auth)/);
  });

  test("shows category preview section", async ({ page }) => {
    await page.goto("/");

    // Should show some health categories
    const pageContent = await page.innerText("body");
    const hasCategories =
      pageContent?.includes("Sleep") ||
      pageContent?.includes("Focus") ||
      pageContent?.includes("Exercise") ||
      pageContent?.includes("health");

    expect(hasCategories).toBeTruthy();
  });

  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Filter out known non-critical errors (e.g., favicon, hydration warnings)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("Hydration") &&
        !e.includes("hydration") &&
        !e.includes("Extra attributes from the server")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
