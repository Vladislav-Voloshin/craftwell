/**
 * E2E Tests: SEO (Sprint 14)
 *
 * Tests robots.txt, sitemap.xml, meta tags, and OG tags.
 */

import { test, expect } from "./fixtures";

test.describe("SEO", () => {
  test("robots.txt is accessible and has correct content", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Sitemap:");
  });

  test("sitemap.xml is accessible and lists routes", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("craftwell.vercel.app");
    expect(body).toContain("/protocols");
  });

  test("landing page has proper meta tags", async ({ page }) => {
    await page.goto("/");

    // Title
    const title = await page.title();
    expect(title).toContain("Craftwell");

    // Description
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBeTruthy();
    expect(description).toContain("health protocols");

    // OG tags
    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(ogTitle).toContain("Craftwell");

    const ogType = await page
      .locator('meta[property="og:type"]')
      .getAttribute("content");
    expect(ogType).toBe("website");

    // Twitter card
    const twitterCard = await page
      .locator('meta[name="twitter:card"]')
      .getAttribute("content");
    expect(twitterCard).toBe("summary_large_image");
  });

  test("privacy page has its own title", async ({ page }) => {
    await page.goto("/privacy");
    const title = await page.title();
    expect(title).toContain("Privacy");
  });

  test("terms page has its own title", async ({ page }) => {
    await page.goto("/terms");
    const title = await page.title();
    expect(title).toContain("Terms");
  });
});
