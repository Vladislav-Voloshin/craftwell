/**
 * E2E Tests: Citation Display in Chat
 *
 * Tests that assistant responses include source citations from
 * the RAG pipeline, displayed as a "Sources:" section below the
 * response text.
 *
 * The /api/chat route is intercepted with a mock SSE response so
 * these tests are deterministic and do not require a live Pinecone index.
 */

import { test, expect } from "./fixtures";
import { gotoAuthenticated, signInTestUser } from "./helpers";

const MOCK_SOURCES = [
  { type: "podcast", title: "Huberman Lab: Sleep Toolkit", chunk_id: "c1" },
  { type: "newsletter", title: "Toolkit for Sleep", chunk_id: "c2" },
];

const MOCK_SESSION_ID = "test-session-citations";

/** Intercept /api/chat and stream back a canned response with sources. */
async function mockChatWithSources(page: import("@playwright/test").Page) {
  await page.route("/api/chat", async (route) => {
    const metaEvent = `data: ${JSON.stringify({ type: "meta", session_id: MOCK_SESSION_ID, sources: MOCK_SOURCES })}\n\n`;
    const textEvent = `data: ${JSON.stringify({ type: "text", text: "Here are the best sleep protocols based on Huberman Lab research." })}\n\n`;
    const doneEvent = `data: ${JSON.stringify({ type: "done" })}\n\n`;

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: metaEvent + textEvent + doneEvent,
    });
  });
}

/** Intercept /api/chat and return a response with no sources. */
async function mockChatNoSources(page: import("@playwright/test").Page) {
  await page.route("/api/chat", async (route) => {
    const metaEvent = `data: ${JSON.stringify({ type: "meta", session_id: MOCK_SESSION_ID, sources: [] })}\n\n`;
    const textEvent = `data: ${JSON.stringify({ type: "text", text: "To improve focus, try these techniques." })}\n\n`;
    const doneEvent = `data: ${JSON.stringify({ type: "done" })}\n\n`;

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: metaEvent + textEvent + doneEvent,
    });
  });
}

test.describe("Citation Display", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/chat");
    await expect(
      page.getByPlaceholder(/ask about health protocols/i)
    ).toBeVisible({ timeout: 20000 });
  });

  test("assistant response displays source citations", async ({ page }) => {
    await mockChatWithSources(page);

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("What are the best protocols for improving sleep quality?");
    await page.getByRole("button", { name: /send/i }).click();

    const messagesArea = page.locator(".max-w-3xl.mx-auto");

    // Wait for assistant bubble to appear
    await messagesArea
      .locator('[class*="bg-muted"]')
      .first()
      .waitFor({ timeout: 15000 });

    // Wait for streaming cursor to disappear
    await expect(page.locator(".animate-pulse")).toHaveCount(0, {
      timeout: 10000,
    });

    // "Sources:" label must be visible
    const sourcesLabel = messagesArea.getByText("Sources:");
    await expect(sourcesLabel).toBeVisible({ timeout: 5000 });

    // Both mock source titles must appear
    for (const source of MOCK_SOURCES) {
      await expect(messagesArea.getByText(source.title)).toBeVisible();
    }
  });

  test("citation section has correct structure", async ({ page }) => {
    await mockChatWithSources(page);

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("Tell me about cold exposure benefits");
    await page.getByRole("button", { name: /send/i }).click();

    const messagesArea = page.locator(".max-w-3xl.mx-auto");

    await messagesArea
      .locator('[class*="bg-muted"]')
      .first()
      .waitFor({ timeout: 15000 });

    await expect(page.locator(".animate-pulse")).toHaveCount(0, {
      timeout: 10000,
    });

    // Citation container has a top border separator
    const citationContainer = messagesArea.locator(
      '[class*="border-t"][class*="border-border"]'
    );
    await expect(citationContainer.first()).toBeVisible();
    await expect(citationContainer.first().getByText("Sources:")).toBeVisible();
  });

  test("user messages do not show citations", async ({ page }) => {
    await mockChatNoSources(page);

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("How do I improve focus?");
    await page.getByRole("button", { name: /send/i }).click();

    const messagesArea = page.locator(".max-w-3xl.mx-auto");

    // User messages are wrapped in a right-aligned flex container
    const userMessage = messagesArea
      .locator(".flex.justify-end")
      .filter({ hasText: "How do I improve focus?" });
    await expect(userMessage).toBeVisible({ timeout: 5000 });

    // User message must not contain a "Sources:" section
    await expect(userMessage.getByText("Sources:")).toHaveCount(0);
  });
});
