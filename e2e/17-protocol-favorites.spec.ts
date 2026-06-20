import { test, expect } from "./fixtures";
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

    // Use the API response body to determine actual DB state — the SSR-rendered
    // aria-label can be stale when parallel workers share the same test account.
    const [res1] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    expect(res1.ok()).toBe(true);
    const afterFirst = (await res1.json()).favorited as boolean;
    const label1 = afterFirst ? "Remove from favorites" : "Add to favorites";
    await expect(firstHeart).toHaveAttribute("aria-label", label1, { timeout: 10000 });

    // Second click must toggle to the opposite state
    const [res2] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    expect(res2.ok()).toBe(true);
    const afterSecond = (await res2.json()).favorited as boolean;
    expect(afterSecond).toBe(!afterFirst);
    const label2 = afterSecond ? "Remove from favorites" : "Add to favorites";
    await expect(firstHeart).toHaveAttribute("aria-label", label2, { timeout: 10000 });
  });

  test("favorites filter shows only favorited protocols", async ({ page }) => {
    const firstHeart = page.locator("main button[aria-label*='favorites']").first();

    // Ensure the first protocol is favorited — check the API response so we
    // handle the case where the SSR label is stale (parallel-worker mismatch).
    const [ensureRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      firstHeart.click(),
    ]);
    const ensureBody = await ensureRes.json();
    if (!ensureBody.favorited) {
      // Click removed it (DB was already favorited) — click once more to add it back
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
        firstHeart.click(),
      ]);
    }
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

    // Unfavorite to clean up — wait for API so we don't leave a dangling request
    const heartInFiltered = page.locator("main button[aria-label='Remove from favorites']").first();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
      heartInFiltered.click(),
    ]);
  });

  test("shows favorite button on protocol detail page", async ({ page }) => {
    // Navigate to detail page
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);
    // Wait for SSR page to fully render before asserting interactive elements
    await page.waitForLoadState("domcontentloaded");

    // Should see favorite button
    const heartButton = page.locator("button[aria-label*='favorites']");
    await expect(heartButton).toBeVisible({ timeout: 15000 });
  });

  test("can toggle favorite on protocol detail page", async ({ page }) => {
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    const heartButton = page.locator("button[aria-label*='favorites']");
    await expect(heartButton).toBeVisible({ timeout: 15000 });

    // Read initial state — parallel workers may have left the protocol favorited or not
    const initialLabel = await heartButton.getAttribute("aria-label");
    const startedFavorited = initialLabel?.includes("Remove");

    // Normalize to "not favorited" so the add→remove cycle is predictable
    if (startedFavorited) {
      const [resetRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/protocols/favorites") && r.status() === 200),
        heartButton.click(),
      ]);
      expect(resetRes.ok()).toBe(true);
      await expect(heartButton).toHaveAttribute("aria-label", "Add to favorites", { timeout: 10000 });
    }

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
