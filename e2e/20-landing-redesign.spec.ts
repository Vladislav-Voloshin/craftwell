/**
 * E2E Tests: Landing Page Redesign (Sprint 14)
 *
 * Tests the redesigned landing page sections:
 * Hero, How It Works, Feature Highlights, Categories, Stats, Final CTA, Footer.
 */

import { test, expect } from "@playwright/test";

test.describe("Landing Page Redesign", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("hero section has title, subtitle, and CTAs", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /science-based health protocols/i })
    ).toBeVisible();

    await expect(page.getByText(/evidence-based protocols/i)).toBeVisible();

    // Primary CTA (first of two "Get Started" links)
    const getStarted = page.getByRole("link", { name: /get started/i }).first();
    await expect(getStarted).toBeVisible();

    // Secondary CTA
    const browse = page.getByRole("link", { name: /browse protocols/i });
    await expect(browse).toBeVisible();

    // Trust line
    await expect(page.getByText(/free to start/i)).toBeVisible();
  });

  test("How It Works section shows 3 steps", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /how it works/i })
    ).toBeVisible();

    await expect(page.getByText("Browse Protocols").first()).toBeVisible();
    await expect(page.getByText("Follow the Science")).toBeVisible();
    await expect(page.getByText("Track Your Progress")).toBeVisible();
  });

  test("Feature Highlights section shows 3 features", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /everything you need/i })
    ).toBeVisible();

    await expect(page.getByText("10 Health Categories")).toBeVisible();
    await expect(page.getByText("AI Health Adviser")).toBeVisible();
    await expect(page.getByText(/track.*build habits/i)).toBeVisible();
  });

  test("categories section shows all 10 categories", async ({ page }) => {
    const categories = [
      "Sleep",
      "Focus",
      "Exercise",
      "Stress",
      "Nutrition",
      "Hormones",
      "Cold/Heat",
      "Light",
      "Motivation",
      "Mental Health",
    ];

    for (const cat of categories) {
      await expect(page.getByText(cat, { exact: true }).first()).toBeVisible();
    }
  });

  test("stats section shows protocol counts", async ({ page }) => {
    await expect(page.getByText("50+").first()).toBeVisible();
    await expect(page.getByText("500+")).toBeVisible();
    await expect(page.getByText("Protocols").first()).toBeVisible();
  });

  test("final CTA section has call to action", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /ready to optimize/i })
    ).toBeVisible();

    const ctaButton = page.getByRole("link", {
      name: /get started.*free/i,
    });
    await expect(ctaButton).toBeVisible();
  });

  test("footer has Privacy Policy and Terms links", async ({ page }) => {
    const privacy = page.getByRole("link", { name: /privacy policy/i });
    await expect(privacy).toBeVisible();
    await expect(privacy).toHaveAttribute("href", "/privacy");

    const terms = page.getByRole("link", { name: /terms of service/i });
    await expect(terms).toBeVisible();
    await expect(terms).toHaveAttribute("href", "/terms");
  });

  test("footer has disclaimer and copyright", async ({ page }) => {
    await expect(page.getByText(/not medical advice/i)).toBeVisible();
    await expect(page.getByText(/© 2026 Craftwell/i)).toBeVisible();
  });

  test("Get Started CTA navigates to auth page", async ({ page }) => {
    const cta = page.getByRole("link", { name: /get started/i }).first();
    await cta.click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test("sticky header stays visible on scroll", async ({ page }) => {
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(300);

    // Header should still be visible
    await expect(page.getByText("Craftwell").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /sign in/i })
    ).toBeVisible();
  });
});
