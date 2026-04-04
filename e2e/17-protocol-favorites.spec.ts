import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers";

test.describe("Protocol Favorites", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });
  });

  test("shows favorite buttons on protocol cards when logged in", async ({ page }) => {
    const heartButtons = page.locator("main button[aria-label*='favorites']");
    await expect(heartButtons.first()).toBeVisible();
  });

  test("can toggle favorite on a protocol card", async ({ page }) => {
    const firstHeart = page.locator("main button[aria-label*='favorites']").first();
    await expect(firstHeart).toBeVisible();

    // Click to favorite — wait for API response
    const [favResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    expect(favResponse.ok()).toBe(true);
    await expect(firstHeart).toHaveAttribute("aria-label", "Remove from favorites", { timeout: 10000 });

    // Click to unfavorite — wait for API response
    const [unfavResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    expect(unfavResponse.ok()).toBe(true);
    await expect(firstHeart).toHaveAttribute("aria-label", "Add to favorites", { timeout: 10000 });
  });

  test("favorites filter shows only favorited protocols", async ({ page }) => {
    // Favorite the first protocol — wait for API
    const firstHeart = page.locator("main button[aria-label*='favorites']").first();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    await expect(firstHeart).toHaveAttribute("aria-label", "Remove from favorites", { timeout: 10000 });

    // Click Favorites filter
    const favoritesFilter = page.getByRole("button", { name: "Favorites", exact: true });
    await expect(favoritesFilter).toBeVisible();
    await favoritesFilter.click();

    // Should show at least 1 card
    const cards = page.locator("main a[href^='/protocols/']");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Unfavorite to clean up
    const heartInFiltered = page.locator("main button[aria-label='Remove from favorites']").first();
    await heartInFiltered.click();
  });

  test("shows favorite button on protocol detail page", async ({ page }) => {
    // Navigate to detail page
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    // Should see favorite button
    const heartButton = page.locator("button[aria-label*='favorites']");
    await expect(heartButton).toBeVisible();
  });

  test("can toggle favorite on protocol detail page", async ({ page }) => {
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    const heartButton = page.locator("button[aria-label*='favorites']");
    await expect(heartButton).toBeVisible({ timeout: 15000 });

    // Toggle favorite — wait for API response
    const [favRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      heartButton.click(),
    ]);
    expect(favRes.ok()).toBe(true);
    await expect(heartButton).toHaveAttribute("aria-label", "Remove from favorites", { timeout: 10000 });

    // Toggle unfavorite — wait for API response
    const [unfavRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      heartButton.click(),
    ]);
    expect(unfavRes.ok()).toBe(true);
    await expect(heartButton).toHaveAttribute("aria-label", "Add to favorites", { timeout: 10000 });
  });
});
