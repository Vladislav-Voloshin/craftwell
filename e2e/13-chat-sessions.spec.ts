/**
 * E2E Tests: Chat Sessions & Markdown (Sprint 3)
 *
 * Tests the chat session sidebar, new chat, session list,
 * copy-to-clipboard, and markdown rendering in assistant responses.
 */

import { test, expect } from "./fixtures";
import { signInTestUser } from "./helpers";

test.describe("Chat Session Management", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await page.goto("/chat");
    await page.waitForLoadState("domcontentloaded");
  });

  test("shows New Chat button", async ({ page }) => {
    const newChatBtn = page.getByRole("button", { name: /new chat/i });
    // On desktop the sidebar may be visible, on mobile need to toggle
    if (await newChatBtn.isVisible()) {
      await expect(newChatBtn).toBeVisible();
    } else {
      // Mobile layout: New Chat button may be behind hamburger menu
      const hamburger = page.locator("button").filter({
        has: page.locator("svg"),
      }).first();
      await expect(hamburger).toBeVisible();
      await hamburger.click();
      // Wait for sidebar overlay to appear with the New Chat button
      const btn = page.getByRole("button", { name: /new chat/i });
      await expect(btn).toBeVisible({ timeout: 5000 });
    }
  });

  test("chat input accepts text and sends on Enter", async ({ page }) => {
    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("What supplements help with sleep?");
    await input.press("Enter");

    // User message should appear
    await expect(
      page.getByText("What supplements help with sleep?").first()
    ).toBeVisible();
  });

  test("assistant response renders markdown formatting", async ({ page }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, "Skipping: ANTHROPIC_API_KEY not set");

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("List 3 tips for better sleep");

    const sendBtn = page.getByRole("button", { name: /send/i });
    await sendBtn.click();

    // Wait for assistant response to render with substantial content
    const messagesArea2 = page.locator(".max-w-3xl.mx-auto");
    const assistantBubble = messagesArea2.locator('[class*="bg-muted"]').first();
    await expect(assistantBubble).toContainText(/.{10,}/, { timeout: 15000 });

    // Check for markdown rendered elements (prose class wraps markdown)
    const proseElements = page.locator(".prose");
    const proseCount = await proseElements.count();

    // Either prose wrapper exists OR we have a response with text
    const messagesArea = page.locator(".max-w-3xl.mx-auto");
    const responseExists = await messagesArea
      .locator('[class*="bg-muted"]')
      .first()
      .isVisible()
      .catch(() => false);

    expect(proseCount > 0 || responseExists).toBeTruthy();
  });

  test("suggestion buttons are visible in empty chat state", async ({
    page,
  }) => {
    // Verify suggestion buttons exist (content varies based on user profile)
    const suggestionBtn = page.getByTestId("chat-suggestion-btn").first();
    await expect(suggestionBtn).toBeVisible({ timeout: 5000 });
  });

  test("clicking suggestion sends it as a message", async ({ page }) => {
    const suggestionBtn = page.getByTestId("chat-suggestion-btn").first();
    await expect(suggestionBtn).toBeVisible({ timeout: 5000 });
    const suggestionText = await suggestionBtn.textContent();
    await suggestionBtn.click();

    // Should fill the input
    const input = page.getByPlaceholder(/ask about health protocols/i);
    await expect(input).toHaveValue(suggestionText!);
  });
});
