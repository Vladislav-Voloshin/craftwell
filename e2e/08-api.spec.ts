/**
 * E2E Tests: API Routes
 *
 * Tests API endpoints for proper auth, response format, and error handling.
 *
 * Protected endpoints must reject contexts with no Supabase session cookie
 * before any route-specific validation or external service call runs.
 */

import { test, expect, type APIRequestContext } from "./fixtures";

// These requests intentionally exercise the no-session security boundary.
test.use({ workerAuth: false });

let anonRequest: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  anonRequest = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
  });
});

test.afterAll(async () => {
  await anonRequest.dispose();
});

test.describe("API: Chat Endpoint", () => {
  test("POST /api/chat without auth returns 401", async () => {
    const res = await anonRequest.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: { message: "test" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe("API: User Protocols Endpoint", () => {
  test("GET /api/protocols/user without auth returns 401", async () => {
    const res = await anonRequest.get("/api/protocols/user");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/protocols/user without auth returns 401", async () => {
    const res = await anonRequest.post("/api/protocols/user", {
      headers: { "Content-Type": "application/json" },
      data: { protocol_id: "test", action: "activate" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe("API: Ingest Endpoint", () => {
  test("POST /api/ingest without admin key returns 401", async () => {
    const res = await anonRequest.post("/api/ingest", {
      headers: { "Content-Type": "application/json" },
      data: { step: "extract-protocols" },
    });
    // No Authorization header → always 401 (ADMIN_API_KEY check fails)
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/ingest with wrong admin key returns 401", async () => {
    const res = await anonRequest.post("/api/ingest", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer deliberately-wrong-key",
      },
      data: { step: "nonexistent-step" },
    });
    // Wrong key → always 401
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/ingest with valid key but unknown step returns 400", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    test.skip(!adminKey, "Skipping: ADMIN_API_KEY not set");

    const res = await anonRequest.post("/api/ingest", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminKey}`,
      },
      data: { step: "nonexistent-step" },
    });
    // Valid key but unknown step → 400
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unknown step");
  });
});

test.describe("API: Auth Callback", () => {
  test("GET /auth/callback without code redirects to auth with error", async ({
    page,
  }) => {
    await page.goto("/auth/callback");
    await page.waitForURL("**/auth*", { timeout: 10000 });
    expect(page.url()).toContain("/auth");
  });
});
