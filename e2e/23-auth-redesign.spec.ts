/**
 * E2E Tests: Auth Page Redesign (Sprint 14)
 *
 * Tests the polished auth page with unified toggles, branding, and legal links.
 * NOTE: Auth uses custom segmented-control buttons + floating-label inputs.
 */

import { test, expect } from "./fixtures";

test.describe("Auth Page Redesign", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
  });

  test("displays Craftwell branding and tagline", async ({ page }) => {
    // CardTitle renders as <div>, not a semantic heading, so use getByText
    await expect(
      page.getByText(/welcome to craftwell/i).first()
    ).toBeVisible();

    await expect(
      page.getByText(/science-based health protocols/i)
    ).toBeVisible();
  });

  test("has Google sign-in button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("has unified Sign In / Sign Up toggle", async ({ page }) => {
    const tabBar = page.locator(".bg-muted.p-1");
    await expect(tabBar.getByText("Sign In")).toBeVisible();
    await expect(tabBar.getByText("Sign Up")).toBeVisible();

    // Click Sign Up
    await tabBar.getByText("Sign Up").click();

    // Email form should still be visible (floating label)
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("has unified Email / Phone toggle", async ({ page }) => {
    const emailBtn = page.getByRole("button", { name: "Email" });
    const phoneBtn = page.getByRole("button", { name: "Phone" });

    await expect(emailBtn).toBeVisible();
    await expect(phoneBtn).toBeVisible();

    // Switch to phone
    await phoneBtn.click();
    await expect(page.getByPlaceholder(/555/)).toBeVisible();
  });

  test("has Terms and Privacy links at bottom", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /terms of service/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /privacy policy/i })
    ).toBeVisible();
  });

  test("has Forgot password link on sign in", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /forgot password/i })
    ).toBeVisible();
  });
});
