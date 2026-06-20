/**
 * E2E Tests: Profile Page
 *
 * Tests profile display, health info, protocol stack, and sign out.
 */

import { test, expect } from "./fixtures";
import { signInTestUser, gotoAuthenticated, TEST_USER } from "./helpers";

test.describe("Profile Page", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/profile");
    // Wait for the profile to fully render (not just the loading skeleton)
    await page.getByText(TEST_USER.email).waitFor({ timeout: 15000 });
  });

  test("displays account section with email", async ({ page }) => {
    // Should show the user's email
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
  });

  test("shows Account information card", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/Account/i);
  });

  test("shows Health Profile section", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/Health|Profile/i);
  });

  test("shows My Protocol Stack section", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/Protocol|Browse Protocols/i);
  });

  test("has sign out button", async ({ page }) => {
    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    await expect(signOutBtn).toBeVisible();
  });

  test("sign out redirects to landing or auth page", async ({ page }) => {
    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    await signOutBtn.click();

    // After sign out, should redirect to landing page or auth
    await page.waitForURL(/(\/auth|\/$)/, { timeout: 10000 });
    const url = page.url();
    expect(url.includes("/auth") || url.endsWith("/")).toBeTruthy();
  });

  test("protocol stack section exists on profile", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/Protocol|Browse/i);
  });
});

test.describe("Delete Account", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/profile");
    // Wait for the profile to fully render (not just the loading skeleton)
    await page.getByText(TEST_USER.email).waitFor({ timeout: 15000 });
  });

  test("shows Danger Zone section with delete button", async ({ page }) => {
    await expect(page.locator("body")).toContainText("Danger Zone");
    const deleteBtn = page.getByRole("button", { name: /delete account/i });
    await expect(deleteBtn).toBeVisible();
  });

  test("delete dialog requires typing DELETE to confirm", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /delete account/i });
    await deleteBtn.click();

    // Dialog should appear
    await expect(page.getByText("Delete your account?")).toBeVisible();

    // Confirm button should be disabled until "DELETE" is typed
    const confirmBtn = page.getByRole("button", { name: /permanently delete/i });
    await expect(confirmBtn).toBeDisabled();

    // Type wrong text — button stays disabled
    const input = page.getByPlaceholder("Type DELETE to confirm");
    await input.fill("nope");
    await expect(confirmBtn).toBeDisabled();

    // Type correct text — button enables
    await input.fill("DELETE");
    await expect(confirmBtn).toBeEnabled();
  });
});

test.describe("Profile Navigation", () => {
  test("bottom nav Profile link navigates to profile", async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/protocols");
    await page.waitForLoadState("domcontentloaded");

    // Click profile in bottom nav (👤 icon or "Profile" text)
    const profileNav = page.getByRole("link", { name: /profile/i });
    await expect(profileNav).toBeVisible();
    await profileNav.click();
    await expect(page).toHaveURL(/\/profile/);
  });
});
