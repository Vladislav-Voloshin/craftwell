import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConstructWebhookEvent = vi.fn();
vi.mock("@/lib/stripe", () => ({
  constructWebhookEvent: mockConstructWebhookEvent,
}));

vi.mock("@/lib/env", () => ({
  coreEnv: vi.fn().mockReturnValue({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  }),
}));

const mockUpsert = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 0, error: null }) }) }),
    }),
  }),
}));

vi.mock("@/lib/api/helpers", () => ({
  apiError: vi.fn((msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
}));

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-webhook-test"),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhookRequest(body: string, signature = "t=123,v1=abc"): NextRequest {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
}

function buildSubEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  overrides: Record<string, unknown> = {}
) {
  return {
    type,
    data: {
      object: {
        id: "sub_123",
        customer: "cus_abc",
        status: "active",
        items: { data: [{ price: { id: "price_monthly" } }] },
        metadata: { supabase_user_id: "user-123", plan_type: "monthly" },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        canceled_at: null,
        ended_at: null,
        ...overrides,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructWebhookEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching");
    });

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest('{"type":"test"}', "bad-sig"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("signature verification failed");
  });

  it("returns 200 and received:true for unknown event types", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce({
      type: "payment_intent.created",
      data: { object: {} },
    });

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it("handles checkout.session.completed for lifetime plan", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_lifetime",
          customer: "cus_lifetime",
          client_reference_id: "user-123",
          metadata: { supabase_user_id: "user-123", plan_type: "lifetime" },
          line_items: { data: [{ price: { id: "price_lifetime" } }] },
        },
      },
    });

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        plan_type: "lifetime",
        status: "active",
        stripe_subscription_id: null,
        cancel_at_period_end: false,
      }),
      expect.any(Object)
    );
  });

  it("handles customer.subscription.updated", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce(
      buildSubEvent("customer.subscription.updated")
    );

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        stripe_subscription_id: "sub_123",
        plan_type: "monthly",
        status: "active",
      }),
      expect.any(Object)
    );
  });

  it("handles customer.subscription.deleted", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce(
      buildSubEvent("customer.subscription.deleted", { status: "canceled" })
    );

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        status: "canceled",
      }),
      expect.any(Object)
    );
  });

  it("returns 500 when upsert throws, so Stripe retries", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce(
      buildSubEvent("customer.subscription.updated")
    );
    mockUpsert.mockResolvedValueOnce({ error: { message: "db error" } });

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    // upsert error is thrown, handler returns 500 so Stripe retries
    expect(res.status).toBe(500);
  });

  it("logs warning and returns 200 when subscription event has no user id", async () => {
    const eventWithoutUserId = buildSubEvent("customer.subscription.updated");
    // @ts-expect-error — intentionally removing metadata
    eventWithoutUserId.data.object.metadata = {};

    mockConstructWebhookEvent.mockReturnValueOnce(eventWithoutUserId);

    const { POST } = await import("./route");
    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("maps unknown stripe status to 'incomplete'", async () => {
    mockConstructWebhookEvent.mockReturnValueOnce(
      buildSubEvent("customer.subscription.updated", { status: "unknown_status" })
    );

    const { POST } = await import("./route");
    await POST(makeWebhookRequest("{}"));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "incomplete" }),
      expect.any(Object)
    );
  });
});
