/** E2E Tests: Pricing and checkout readiness. */

import { test, expect } from "./fixtures";

test.use({ workerAuth: false });

test.describe("Pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  });

  test("shows all three plans and prices", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Free", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pro", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Founding Member", exact: true })
    ).toBeVisible();
    await expect(page.getByText("$12.99", { exact: true })).toBeVisible();
    await expect(page.getByText("$149", { exact: true })).toBeVisible();
  });

  test("shows a safe error when checkout is unavailable", async ({ page }) => {
    await page.route("/api/stripe/checkout", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Checkout is temporarily unavailable. Your account was not charged.",
        }),
      })
    );

    await page.getByRole("button", { name: "Go Pro" }).click();

    await expect(
      page.getByText(
        "Checkout is temporarily unavailable. Your account was not charged.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(page).toHaveURL(/\/pricing/);
  });
});
