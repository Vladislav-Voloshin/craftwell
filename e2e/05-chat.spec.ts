/**
 * E2E Tests: AI Chat
 *
 * Tests the chat interface, message sending, streaming responses,
 * suggestion buttons, and session management.
 */

import { test, expect } from "./fixtures";
import { signInTestUser, gotoAuthenticated } from "./helpers";

test.describe("Chat Interface", () => {
  test.beforeEach(async ({ page }) => {
    await signInTestUser(page);
    await gotoAuthenticated(page, "/chat");
  });

  test("displays empty chat state with suggestions", async ({ page }) => {
    await expect(
      page.getByText(/ask me anything about health/i)
    ).toBeVisible();

    // Should show 4 suggestion buttons (content varies based on user profile)
    const suggestionButtons = page.getByTestId("chat-suggestion-btn");
    await expect(suggestionButtons.first()).toBeVisible({ timeout: 5000 });
    const count = await suggestionButtons.count();
    expect(count).toBe(4);
  });

  test("has message input and send button", async ({ page }) => {
    await expect(
      page.getByPlaceholder(/ask about health protocols/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    const sendBtn = page.getByRole("button", { name: /send/i });
    await expect(sendBtn).toBeDisabled();
  });

  test("send button enables when text is entered", async ({ page }) => {
    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("How do I sleep better?");

    const sendBtn = page.getByRole("button", { name: /send/i });
    await expect(sendBtn).toBeEnabled();
  });

  test("clicking suggestion fills the input", async ({ page }) => {
    const suggestionBtn = page.getByTestId("chat-suggestion-btn").first();
    await expect(suggestionBtn).toBeVisible({ timeout: 5000 });
    const suggestionText = await suggestionBtn.textContent();
    await suggestionBtn.click();

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await expect(input).toHaveValue(suggestionText!);
  });

  test("sending a message shows user bubble and streaming response", async ({
    page,
  }) => {
    // This test requires a live ANTHROPIC_API_KEY — skip in CI when unavailable
    test.skip(!process.env.ANTHROPIC_API_KEY, "Skipping: ANTHROPIC_API_KEY not set");

    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("What is cold exposure?");

    const sendBtn = page.getByRole("button", { name: /send/i });
    await sendBtn.click();

    // User message should appear (use first() since sidebar may also show the text)
    await expect(page.getByText("What is cold exposure?").first()).toBeVisible();

    // Assistant response should start streaming (wait up to 15 seconds)
    // The assistant card is inside .max-w-3xl within the message area
    const messagesArea = page.locator(".max-w-3xl.mx-auto");
    await messagesArea.locator('[class*="bg-muted"]').first().waitFor({ timeout: 15000 });

    // Eventually should have some response text
    const assistantBubble = messagesArea.locator('[class*="bg-muted"]').first();
    await expect(assistantBubble).toBeVisible();

    // Wait for streaming to complete — response should have substantial content
    await expect(assistantBubble).toContainText(/.{10,}/, { timeout: 15000 });

    const responseText = await assistantBubble.textContent();
    expect(responseText?.length).toBeGreaterThan(10);
    expect(responseText).not.toMatch(/failed to generate response|something went wrong/i);
  });

  test("can send message with Enter key", async ({ page }) => {
    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("Hello from e2e test");
    await input.press("Enter");

    // User message should appear (first() to avoid sidebar duplicates)
    await expect(page.getByText("Hello from e2e test").first()).toBeVisible({ timeout: 5000 });
  });

  test("Shift+Enter adds newline instead of sending", async ({ page }) => {
    const input = page.getByPlaceholder(/ask about health protocols/i);
    await input.fill("Line 1");
    await input.press("Shift+Enter");
    await input.type("Line 2");

    // Should still have text in input (not sent)
    const value = await input.inputValue();
    expect(value).toContain("Line 1");
    expect(value).toContain("Line 2");
  });
});
