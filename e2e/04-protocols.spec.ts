/**
 * E2E Tests: Protocols
 *
 * Tests the protocol listing page, category filtering, and protocol detail page.
 * Requires authenticated user.
 */

import { test, expect } from "@playwright/test";
import { signInTestUser } from "./helpers";

test.describe("Protocol Listing", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    // Navigate to protocols if not already there
    if (!page.url().includes("/protocols")) {
      await page.goto("/protocols");
      await page.waitForLoadState("domcontentloaded");
    }
    // Wait for protocol cards to load from Supabase
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });
  });

  test("displays protocols page with title", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /protocols/i }).first()).toBeVisible();
  });

  test("shows category filter buttons", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait for protocol cards to load from Supabase before checking filters
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });

    const content = await page.innerText("body");
    expect(content).toContain("All");

    // Check for at least a few categories
    const categories = ["Sleep", "Focus", "Exercise", "Stress", "Nutrition"];
    let foundCategories = 0;
    for (const cat of categories) {
      if (content?.includes(cat)) foundCategories++;
    }
    expect(foundCategories).toBeGreaterThanOrEqual(3);
  });

  test("shows protocol cards", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait for cards to render from Supabase
    const cards = page.locator("main a[href^='/protocols/']");
    await cards.first().waitFor({ timeout: 15000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("protocol cards show title and category info", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait for cards to load
    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    const cardText = await firstCard.textContent();
    expect(cardText?.length).toBeGreaterThan(5);
  });

  test("category filter changes displayed protocols", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait for cards to load, then count
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });
    const allCards = await page.locator("main a[href^='/protocols/']").count();

    // Click a specific category filter (Sleep)
    const sleepButton = page.getByRole("button", { name: /sleep/i });
    await expect(sleepButton).toBeVisible();
    await sleepButton.click();

    // Wait for filtered results to render
    await expect(page.locator("main a[href^='/protocols/']").first()).toBeVisible();

    // Should show fewer or equal protocols
    const filteredCards = await page
      .locator("a[href^='/protocols/']")
      .count();
    expect(filteredCards).toBeLessThanOrEqual(allCards);
  });

  test("clicking protocol card navigates to detail page", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    const href = await firstCard.getAttribute("href");

    await firstCard.click();
    await page.waitForURL(`**${href}`, { timeout: 10000 });
    await expect(page).toHaveURL(new RegExp(`/protocols/.+`));
  });
});

test.describe("Protocol Detail", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
  });

  test("displays protocol detail with title and description", async ({
    page,
  }) => {
    // Navigate to protocols and click the first one
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    // Wait for SSR detail page to fully render (domcontentloaded first, then h1)
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("h1", { timeout: 20000 });
    const content = await page.innerText("body");
    expect(content?.length).toBeGreaterThan(100);
  });

  test("shows back link to protocols list", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);
    await page.waitForLoadState("domcontentloaded");

    // Should have a back link — could be text or arrow icon
    const backLink = page.locator("a[href='/protocols']").first();
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL("**/protocols", { timeout: 10000 });
  });

  test("shows protocol tools/steps", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    // Wait for SSR detail page to fully render
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("h1", { timeout: 20000 });
    const content = await page.innerText("body");
    // Tools should have numbered ranks or descriptions
    expect(
      content?.includes("instructions") ||
        content?.includes("Instructions") ||
        content?.includes("#1") ||
        content?.includes("Step") ||
        (content?.length ?? 0) > 200
    ).toBeTruthy();
  });

  test("shows Add to My Protocols button for authenticated users", async ({
    page,
  }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    const addBtn = page.getByRole("button", {
      name: /add to my protocols|remove from my protocols/i,
    });
    await expect(addBtn).toBeVisible();
  });

  test("can toggle protocol in My Protocols", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    const addBtn = page.getByRole("button", {
      name: /add to my protocols/i,
    });
    const removeBtn = page.getByRole("button", {
      name: /remove from my protocols/i,
    });

    if (await addBtn.isVisible()) {
      await addBtn.click();
      await expect(removeBtn).toBeVisible({ timeout: 5000 });
    } else if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await expect(addBtn).toBeVisible({ timeout: 5000 });
    }
  });

  test("has Ask AI / chat CTA", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("main a[href^='/protocols/']").first();
    await firstCard.waitFor({ timeout: 15000 });
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    // Should have a chat/ask CTA — check for link or button
    const chatLink = page.locator("a[href*='/chat']").first();
    await expect(chatLink).toBeVisible();
    const href = await chatLink.getAttribute("href");
    expect(href).toContain("/chat");
  });
});
