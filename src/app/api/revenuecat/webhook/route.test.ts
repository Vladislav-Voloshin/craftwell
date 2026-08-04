import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mapRevenueCatEvent } from "@/lib/revenuecat";

vi.mock("@/lib/api/request-id", () => ({ getRequestId: vi.fn(() => "req-test") }));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/api/helpers", () => ({
  apiError: vi.fn((msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
}));

const mockUpsert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({ upsert: mockUpsert }) })),
}));

function makeReq(body: unknown, auth = "secret-123"): NextRequest {
  return new NextRequest("http://localhost/api/revenuecat/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(body),
  });
}

// ── Pure mapping logic ──────────────────────────────────────────────────────
describe("mapRevenueCatEvent", () => {
  it("INITIAL_PURCHASE (monthly) → active + period end", () => {
    const u = mapRevenueCatEvent({
      type: "INITIAL_PURCHASE",
      app_user_id: "u1",
      product_id: "craftwell_premium_monthly",
      expiration_at_ms: 1893456000000,
    });
    expect(u).toMatchObject({ planType: "monthly", status: "active", cancelAtPeriodEnd: false });
    expect(u?.currentPeriodEnd).toBe(new Date(1893456000000).toISOString());
  });

  it("free trial → trialing", () => {
    expect(
      mapRevenueCatEvent({
        type: "INITIAL_PURCHASE",
        app_user_id: "u1",
        product_id: "craftwell_premium_annual",
        period_type: "TRIAL",
      })?.status
    ).toBe("trialing");
  });

  it("EXPIRATION → canceled", () => {
    expect(
      mapRevenueCatEvent({ type: "EXPIRATION", app_user_id: "u1", product_id: "craftwell_premium_monthly" })?.status
    ).toBe("canceled");
  });

  it("BILLING_ISSUE → past_due", () => {
    expect(
      mapRevenueCatEvent({ type: "BILLING_ISSUE", app_user_id: "u1", product_id: "craftwell_premium_monthly" })?.status
    ).toBe("past_due");
  });

  it("CANCELLATION → still active, cancel_at_period_end", () => {
    expect(
      mapRevenueCatEvent({ type: "CANCELLATION", app_user_id: "u1", product_id: "craftwell_premium_monthly" })
    ).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
  });

  it("lifetime (NON_RENEWING_PURCHASE) → active, no period end", () => {
    expect(
      mapRevenueCatEvent({ type: "NON_RENEWING_PURCHASE", app_user_id: "u1", product_id: "craftwell_premium_lifetime" })
    ).toMatchObject({ planType: "lifetime", status: "active", currentPeriodEnd: null });
  });

  it("unknown product → null", () => {
    expect(
      mapRevenueCatEvent({ type: "INITIAL_PURCHASE", app_user_id: "u1", product_id: "some_other_sku" })
    ).toBeNull();
  });

  it("non-entitlement event (TEST) → null", () => {
    expect(
      mapRevenueCatEvent({ type: "TEST", app_user_id: "u1", product_id: "craftwell_premium_monthly" })
    ).toBeNull();
  });
});

// ── Route ───────────────────────────────────────────────────────────────────
describe("POST /api/revenuecat/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REVENUECAT_WEBHOOK_SECRET = "secret-123";
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("returns 401 for a bad Authorization header", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ event: { type: "INITIAL_PURCHASE", app_user_id: "u1", product_id: "craftwell_premium_monthly" } }, "wrong")
    );
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts an apple entitlement on INITIAL_PURCHASE", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "user-abc",
          product_id: "craftwell_premium_monthly",
          expiration_at_ms: 1893456000000,
          original_transaction_id: "txn-1",
        },
      })
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-abc",
        provider: "apple",
        plan_type: "monthly",
        status: "active",
        provider_transaction_id: "txn-1",
      }),
      { onConflict: "user_id" }
    );
  });

  it("ignores unrecognised events without upserting", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ event: { type: "TEST", app_user_id: "u1", product_id: "craftwell_premium_monthly" } })
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 500 when the upsert fails (so RevenueCat retries)", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "db down" } });
    const { POST } = await import("./route");
    const res = await POST(
      makeReq({ event: { type: "RENEWAL", app_user_id: "u1", product_id: "craftwell_premium_annual", expiration_at_ms: 1893456000000 } })
    );
    expect(res.status).toBe(500);
  });
});
