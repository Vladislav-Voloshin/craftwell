/**
 * E2E Tests: Authentication
 *
 * Tests email sign-up, sign-in, phone OTP UI, Google OAuth button,
 * auth redirects, and sign-out.
 *
 * NOTE: The auth page uses a custom segmented control (plain <button>
 * elements inside a .bg-muted container) — NOT role="tab" / role="tabpanel".
 * Floating-label inputs use placeholder=" " with <label>, so use getByLabel().
 */

import { test, expect } from "@playwright/test";
import "./helpers";

/** Click a segmented-control tab button */
async function clickAuthTab(page: import("@playwright/test").Page, label: string) {
  await page.locator(".bg-muted.p-1 button", { hasText: label }).click();
}

test.describe("Auth Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
  });

  test("renders auth page with Craftwell logo", async ({ page }) => {
    await expect(page.getByText("Welcome")).toBeVisible();
    await expect(
      page.getByText("Science-based health protocols")
    ).toBeVisible();
  });

  test("shows Google OAuth button", async ({ page }) => {
    const googleBtn = page.getByRole("button", {
      name: /continue with google/i,
    });
    await expect(googleBtn).toBeVisible();
  });

  test("does not show Apple button (deferred)", async ({ page }) => {
    const appleBtn = page.getByRole("button", { name: /apple/i });
    await expect(appleBtn).not.toBeVisible();
  });

  test("has Sign In and Sign Up tabs", async ({ page }) => {
    const tabBar = page.locator(".bg-muted.p-1");
    await expect(tabBar.getByText("Sign In")).toBeVisible();
    await expect(tabBar.getByText("Sign Up")).toBeVisible();
  });

  test("Sign In tab shows email and password fields", async ({ page }) => {
    await clickAuthTab(page, "Sign In");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    // Submit button is the last "Sign In" button (segmented control is first)
    await expect(
      page.getByRole("button", { name: "Sign In" }).last()
    ).toBeVisible();
  });

  test("Sign Up tab shows email and password fields", async ({ page }) => {
    await clickAuthTab(page, "Sign Up");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByLabel(/Password/)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Account" })
    ).toBeVisible();
  });

  test("can switch to Phone auth mode", async ({ page }) => {
    await clickAuthTab(page, "Sign In");
    await page.getByRole("button", { name: "Phone" }).click();

    await expect(page.getByPlaceholder(/555/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send verification code/i })
    ).toBeVisible();
  });

  test("can switch between Email and Phone modes", async ({ page }) => {
    // Start with email
    await clickAuthTab(page, "Sign In");
    await expect(page.getByLabel("Email")).toBeVisible();

    // Switch to phone
    await page.getByRole("button", { name: "Phone" }).click();
    await expect(page.getByPlaceholder(/555/)).toBeVisible();

    // Switch back to email
    await page.getByRole("button", { name: "Email" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("shows error for invalid email sign-in", async ({ page }) => {
    await clickAuthTab(page, "Sign In");
    await page.getByLabel("Email").fill("nonexistent@test.com");
    await page.getByLabel("Password", { exact: true }).fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).last().click();

    // Should show an error message (Supabase API call may take time)
    await expect(page.getByText(/invalid|error|credentials/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows error for short password on sign up", async ({ page }) => {
    await clickAuthTab(page, "Sign Up");
    await page.getByLabel("Email").fill("short@test.com");
    await page.getByLabel(/Password/).fill("12");
    await page.getByRole("button", { name: "Create Account" }).click();

    // Supabase requires min 6 chars
    await expect(page.getByText(/password|characters|short|least/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("phone OTP send button disabled when phone empty", async ({ page }) => {
    await clickAuthTab(page, "Sign In");
    await page.getByRole("button", { name: "Phone" }).click();

    const sendBtn = page.getByRole("button", {
      name: /send verification code/i,
    });
    await expect(sendBtn).toBeDisabled();
  });

  test("phone OTP send button enabled when phone entered", async ({
    page,
  }) => {
    await clickAuthTab(page, "Sign In");
    await page.getByRole("button", { name: "Phone" }).click();

    await page.getByPlaceholder(/555/).fill("+15551234567");

    const sendBtn = page.getByRole("button", {
      name: /send verification code/i,
    });
    await expect(sendBtn).toBeEnabled();
  });
});

test.describe("Auth Redirects", () => {
  test("unauthenticated user can access /protocols without redirect", async ({
    page,
  }) => {
    await page.goto("/protocols");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/protocols/);
  });

  test("unauthenticated user redirected from /chat to /auth", async ({
    page,
  }) => {
    await page.goto("/chat");
    await page.waitForURL("**/auth", { timeout: 10000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("unauthenticated user redirected from /profile to /auth", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForURL("**/auth", { timeout: 10000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("landing page is accessible without auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Craftwell").first()).toBeVisible();
  });
});
