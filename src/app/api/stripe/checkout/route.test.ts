import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/helpers", () => ({
  requireAuth: vi.fn(),
  parseBody: vi.fn(),
  apiError: vi.fn((msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
  handleApiError: vi.fn((err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  ),
}));

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-test"),
}));

vi.mock("@/lib/env", () => ({
  stripeEnv: vi.fn().mockReturnValue({}),
  coreEnv: vi.fn().mockReturnValue({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  }),
}));

const mockSessionCreate = vi.fn();
const mockCustomerList = vi.fn();
const mockCustomerCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    checkout: { sessions: { create: mockSessionCreate } },
    customers: { list: mockCustomerList, create: mockCustomerCreate },
  }),
  PLANS: {
    monthly: { priceId: () => "price_monthly", amount: 1299, mode: "subscription" },
    annual:  { priceId: () => "price_annual",  amount: 9900, mode: "subscription" },
    lifetime: {
      priceId: () => "price_lifetime",
      amount: 14900,
      mode: "payment",
      purchaseCap: 500,
    },
  },
}));

const mockSupabaseSelect = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: mockSupabaseSelect,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, origin = "https://app.example.com"): NextRequest {
  return new NextRequest("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

const mockUser = { id: "user-abc", email: "test@example.com" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/checkout", () => {
  // Import helpers once — vi.clearAllMocks() preserves implementations between tests
  let helpers: typeof import("@/lib/api/helpers");

  beforeEach(async () => {
    // Clear call history only — keeps the chained mock return values intact
    vi.clearAllMocks();

    helpers = await import("@/lib/api/helpers");
    vi.mocked(helpers.requireAuth).mockResolvedValue({ user: mockUser, supabase: {} as never });
    vi.mocked(helpers.parseBody).mockResolvedValue({ plan: "monthly" });
    vi.mocked(helpers.apiError).mockImplementation((msg, status) =>
      new Response(JSON.stringify({ error: msg }), { status })
    );
    vi.mocked(helpers.handleApiError).mockImplementation(() =>
      new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
    );

    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_test" });
    mockSupabaseSelect.mockResolvedValue({ count: 0, error: null });

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("returns 401 when not authenticated", async () => {
    class FakeAuthError extends Error {
      constructor() { super("Unauthorized"); this.name = "AuthError"; }
    }
    vi.mocked(helpers.requireAuth).mockRejectedValueOnce(new FakeAuthError());
    vi.mocked(helpers.handleApiError).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid plan", async () => {
    vi.mocked(helpers.parseBody).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Validation error: plan" }), { status: 400 })
    );

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns checkout URL for monthly plan", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan: "monthly" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ url: "https://checkout.stripe.com/pay/cs_test" });
  });

  it("reuses existing Stripe customer when found", async () => {
    vi.mocked(helpers.parseBody).mockResolvedValueOnce({ plan: "annual" });
    mockCustomerList.mockResolvedValueOnce({ data: [{ id: "cus_existing" }] });

    const { POST } = await import("./route");
    await POST(makeRequest({ plan: "annual" }));

    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" })
    );
  });

  it("returns 410 when lifetime plan is sold out", async () => {
    vi.mocked(helpers.parseBody).mockResolvedValueOnce({ plan: "lifetime" });
    mockSupabaseSelect.mockResolvedValueOnce({ count: 500, error: null });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan: "lifetime" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toContain("sold out");
  });

  it("creates lifetime checkout session when slots remain", async () => {
    vi.mocked(helpers.parseBody).mockResolvedValueOnce({ plan: "lifetime" });
    mockSupabaseSelect.mockResolvedValueOnce({ count: 499, error: null });
    mockSessionCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/pay/cs_lifetime",
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ plan: "lifetime" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/pay/cs_lifetime");
  });

  it("passes success and cancel URLs derived from request origin", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ plan: "monthly" }, "https://myapp.com"));

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: expect.stringContaining("https://myapp.com"),
        cancel_url: expect.stringContaining("https://myapp.com"),
      })
    );
  });

  it("attaches supabase_user_id and plan_type as metadata", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ plan: "monthly" }));

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          supabase_user_id: mockUser.id,
          plan_type: "monthly",
        }),
      })
    );
  });
});
