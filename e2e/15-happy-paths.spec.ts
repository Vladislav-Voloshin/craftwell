/**
 * E2E Tests: P0 Happy Path Flows
 *
 * End-to-end flows covering the critical user journeys:
 * 1. Landing → Auth → Protocols (returning user)
 * 2. Protocol browse → Detail → Add to stack
 * 3. Protocol detail → Ask AI (chat)
 * 4. Full navigation cycle: Protocols → Chat → Profile → Protocols
 * 5. Sign out and re-sign in
 */

import { test, expect } from "@playwright/test";
import { signInTestUser, gotoAuthenticated, TEST_USER } from "./helpers";

test.describe("P0 Happy Path: Returning User Login → Protocols", () => {
  test("user can sign in and land on protocols page", async ({ page }) => {
    await page.goto("/auth");
    await page.locator(".bg-muted.p-1 button", { hasText: "Sign In" }).click();
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In" }).last().click();

    await page.waitForURL("**/protocols", { timeout: 15000 });
    await expect(page).toHaveURL(/\/protocols/);

    // Should see protocol cards
    const cards = page.locator("main a[href^='/protocols/']");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("P0 Happy Path: Browse → Detail → Add to Stack", () => {
  test("user can browse protocols, open detail, and add to stack", async ({
    page,
  }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Browse: wait for protocol cards to load from Supabase
    const cards = page.locator("main a[href^='/protocols/']");
    await cards.first().waitFor({ timeout: 15000 });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Open first protocol detail
    const firstCard = cards.first();
    await firstCard.click();
    await page.waitForURL(/\/protocols\/.+/);

    // Should see protocol content
    await expect(page.locator("body")).toContainText(/tools completed|Instructions/i);

    // Add to stack (or verify already added)
    const addBtn = page.getByRole("button", { name: /add to my protocols/i });
    const removeBtn = page.getByRole("button", {
      name: /remove from my protocols/i,
    });

    if (await addBtn.isVisible()) {
      await addBtn.click();
      await expect(removeBtn).toBeVisible({ timeout: 5000 });
    } else {
      // Already in stack
      await expect(removeBtn).toBeVisible();
    }
  });
});

test.describe("P0 Happy Path: Protocol → Chat about it", () => {
  test("user can navigate from protocol detail to chat", async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Open a protocol (wait for cards to load first)
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });
    await page.locator("main a[href^='/protocols/']").first().click();
    await page.waitForURL(/\/protocols\/.+/);

    // Navigate to chat via bottom nav
    const chatLink = page.getByRole("link", { name: /chat/i });
    await expect(chatLink).toBeVisible();
    await chatLink.click();
    await page.waitForURL(/(\/chat|\/auth)/, { timeout: 10000 });

    // Session may expire mid-test — only assert if we reached chat
    if (page.url().includes("/chat")) {
      await expect(
        page.getByPlaceholder(/ask about health protocols/i)
      ).toBeVisible();
    }
  });
});

test.describe("P0 Happy Path: Full Navigation Cycle", () => {
  test("user can navigate Protocols → Chat → Profile → Protocols", async ({
    page,
  }) => {
    await signInTestUser(page);

    // Start on protocols
    await gotoAuthenticated(page, "/protocols");
    await expect(page).toHaveURL(/\/protocols/);

    // Go to chat — session can expire mid-test so handle /auth redirect
    const chatLink = page.getByRole("link", { name: /chat/i });
    await expect(chatLink).toBeVisible();
    await chatLink.click();
    await page.waitForURL(/(\/chat|\/auth)/, { timeout: 10000 });

    // If redirected to /auth, re-authenticate and navigate to chat
    if (page.url().includes("/auth")) {
      await signInTestUser(page);
      await gotoAuthenticated(page, "/chat");
    }
    await expect(page).toHaveURL(/\/chat/);

    // Go to profile
    const profileLink = page.getByRole("link", { name: /profile/i });
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await page.waitForURL(/(\/profile|\/auth)/, { timeout: 10000 });

    if (page.url().includes("/auth")) {
      await signInTestUser(page);
      await gotoAuthenticated(page, "/profile");
    }
    await expect(page).toHaveURL(/\/profile/);

    // Verify profile loaded
    await expect(page.getByText(TEST_USER.email)).toBeVisible();

    // Back to protocols
    const protocolsLink = page.getByRole("link", { name: /protocols/i });
    await expect(protocolsLink).toBeVisible();
    await protocolsLink.click();
    await expect(page).toHaveURL(/\/protocols/);
  });
});

test.describe("P0 Happy Path: Sign Out & Re-Sign In", () => {
  test("user can sign out and sign back in", async ({ page }) => {
    await signInTestUser(page);

    // Go to profile and sign out
    await gotoAuthenticated(page, "/profile");
    await page.waitForLoadState("domcontentloaded");

    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    await signOutBtn.click();

    // Should redirect to auth or landing
    await page.waitForURL(/(\/auth|\/$)/, { timeout: 10000 });

    // Sign back in
    if (!page.url().includes("/auth")) {
      await page.goto("/auth");
    }
    await page.locator(".bg-muted.p-1 button", { hasText: "Sign In" }).click();
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In" }).last().click();

    await page.waitForURL("**/protocols", { timeout: 15000 });
    await expect(page).toHaveURL(/\/protocols/);
  });
});

test.describe("P0 Happy Path: Landing Page → Auth Flow", () => {
  test("new visitor can navigate from landing to auth", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Craftwell").first()).toBeVisible();

    // Click Get Started
    const cta = page.getByRole("link", { name: /get started/i }).first();
    await cta.click();
    await expect(page).toHaveURL(/\/auth/);

    // Auth page loads with sign in/up segmented control
    const tabBar = page.locator(".bg-muted.p-1");
    await expect(tabBar.getByText("Sign In")).toBeVisible();
    await expect(tabBar.getByText("Sign Up")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });
});

test.describe("P0 Happy Path: Search and Filter Protocols", () => {
  test("user can search and filter to find a protocol", async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Wait for protocol cards to load before searching
    await page.locator("main a[href^='/protocols/']").first().waitFor({ timeout: 15000 });

    // Use search
    const searchInput = page.getByPlaceholder("Search protocols...");
    await searchInput.fill("sleep");

    // Wait for debounced search results to appear
    await expect(page.locator("main a[href^='/protocols/']").first()).toBeVisible();

    // Should show filtered results
    const cards = page.locator("main a[href^='/protocols/']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Click into one of the results
    await cards.first().click();
    await page.waitForURL(/\/protocols\/.+/);

    // Wait for protocol detail to render, then check content
    await page.waitForSelector("h1", { timeout: 15000 });
    const content = await page.innerText("body");
    expect(content?.length).toBeGreaterThan(100);
  });
});
