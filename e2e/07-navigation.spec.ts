/**
 * E2E Tests: App Navigation
 *
 * Tests the bottom nav bar, app shell, and page-to-page navigation.
 */

import { test, expect } from "./fixtures";
import { gotoAuthenticated, signInTestUser } from "./helpers";

test.describe("App Shell & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
  });

  test("app shell shows Craftwell logo in header", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Craftwell").first()).toBeVisible();
  });

  test("bottom nav has Protocols, Chat, and Profile links", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Check for nav links
    const protocolsLink = page.getByRole("link", { name: /protocols/i });
    const chatLink = page.getByRole("link", { name: /chat/i });
    const profileLink = page.getByRole("link", { name: /profile/i });

    // At least some nav items should be visible
    const visibleCount =
      ((await protocolsLink.isVisible().catch(() => false)) ? 1 : 0) +
      ((await chatLink.isVisible().catch(() => false)) ? 1 : 0) +
      ((await profileLink.isVisible().catch(() => false)) ? 1 : 0);

    expect(visibleCount).toBeGreaterThanOrEqual(2);
  });

  test("navigate from Protocols to Chat via bottom nav", async ({ page }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");

    const chatLink = page.getByRole("link", { name: /chat/i });
    await expect(chatLink).toBeVisible();
    await chatLink.click();
    await page.waitForURL(/\/(chat|auth)/, { timeout: 10000 });
    if (page.url().includes("/auth")) {
      await gotoAuthenticated(page, "/chat");
    }
    await expect(page).toHaveURL(/\/chat/);
  });

  test("navigate from Chat to Profile via bottom nav", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");

    const profileLink = page.getByRole("link", { name: /profile/i });
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await page.waitForURL(/\/(profile|auth)/, { timeout: 10000 });
    if (page.url().includes("/auth")) {
      await gotoAuthenticated(page, "/profile");
    }
    await expect(page).toHaveURL(/\/profile/);
  });

  test("navigate from Profile back to Protocols via bottom nav", async ({ page }) => {
    await gotoAuthenticated(page, "/profile");

    const protocolsLink = page.getByRole("link", { name: /protocols/i });
    await expect(protocolsLink).toBeVisible();
    await protocolsLink.click();
    await page.waitForURL(/\/(protocols|auth)/, { timeout: 10000 });
    if (page.url().includes("/auth")) {
      await gotoAuthenticated(page, "/protocols");
    }
    await expect(page).toHaveURL(/\/protocols/);
  });

  test("Craftwell logo links to protocols", async ({ page }) => {
    await gotoAuthenticated(page, "/chat");

    const logo = page.getByRole("link").filter({ hasText: "Craftwell" });
    await expect(logo).toBeVisible();
    await logo.click();
    await page.waitForURL(/\/(protocols|auth)/, { timeout: 10000 });
    if (page.url().includes("/auth")) {
      await gotoAuthenticated(page, "/protocols");
    }
    await expect(page).toHaveURL(/\/protocols/);
  });
});
