/**
 * E2E Tests: Legal Pages (Sprint 14)
 *
 * Tests Privacy Policy (/privacy) and Terms of Service (/terms).
 */

import { test, expect } from "@playwright/test";

test.describe("Privacy Policy Page", () => {
  test("loads and displays all required sections", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /privacy policy/i })
    ).toBeVisible();

    await expect(page.getByText(/last updated.*march 2026/i)).toBeVisible();

    // Key sections
    const sections = [
      "Information We Collect",
      "Third-Party Services",
      "Data Retention",
    ];

    for (const section of sections) {
      await expect(
        page.getByRole("heading", { name: new RegExp(section, "i") })
      ).toBeVisible();
    }
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/privacy");

    const backLink = page.getByRole("link", { name: /back to home/i });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });

  test("mentions key third-party services", async ({ page }) => {
    await page.goto("/privacy");
    const content = await page.innerText("body");

    expect(content).toContain("Supabase");
    expect(content).toContain("Anthropic");
    expect(content).toContain("Sentry");
  });

  test("has contact email", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("privacy@craftwell.app")).toBeVisible();
  });
});

test.describe("Terms of Service Page", () => {
  test("loads and displays all required sections", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /terms of service/i })
    ).toBeVisible();

    await expect(page.getByText(/last updated.*march 2026/i)).toBeVisible();

    // Key sections
    const sections = [
      "Health Disclaimer",
      "User Accounts",
      "Acceptable Use",
      "Limitation of Liability",
    ];

    for (const section of sections) {
      await expect(
        page.getByRole("heading", { name: new RegExp(section, "i") })
      ).toBeVisible();
    }
  });

  test("has health disclaimer prominently", async ({ page }) => {
    await page.goto("/terms");
    const content = await page.innerText("body");

    expect(content).toMatch(/not.*medical advice|does not provide medical/i);
  });

  test("has back to home link", async ({ page }) => {
    await page.goto("/terms");

    const backLink = page.getByRole("link", { name: /back to home/i });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });

  test("has contact email", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText("legal@craftwell.app")).toBeVisible();
  });
});
