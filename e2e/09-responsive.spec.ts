/**
 * E2E Tests: Responsive Design
 *
 * Tests that pages render correctly on mobile and desktop viewports.
 */

import { test, expect } from "@playwright/test";

test.describe("Responsive: Mobile (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("landing page renders on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Craftwell").first()).toBeVisible();
  });

  test("auth page renders on mobile", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText("Welcome")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("auth card is not clipped on small screens", async ({ page }) => {
    await page.goto("/auth");
    const card = page.locator("[class*='card']").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    // Card should not overflow the viewport
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 10); // small margin
  });
});

test.describe("Responsive: Tablet (768x1024)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("landing page renders on tablet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Craftwell").first()).toBeVisible();
  });

  test("auth page renders on tablet", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText("Welcome")).toBeVisible();
  });
});

test.describe("Responsive: Desktop (1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("landing page renders on desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Craftwell").first()).toBeVisible();
  });

  test("auth page renders centered on desktop", async ({ page }) => {
    await page.goto("/auth");
    const card = page.locator("[class*='card']").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    // Card should be centered (not flush left)
    expect(box!.x).toBeGreaterThan(100);
  });
});
