import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/request-id", () => ({ getRequestId: vi.fn(() => "req-test") }));
vi.mock("@/lib/env", () => ({ stripeEnv: vi.fn(() => ({})) }));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPortalCreate = vi.fn();
const mockCustomerList = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
    customers: { list: mockCustomerList },
  })),
}));

vi.mock("@/lib/api/helpers", () => ({
  requireAuth: vi.fn(),
  apiError: vi.fn((msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
  handleApiError: vi.fn(
    () => new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  ),
}));

const mockMaybeSingle = vi.fn();
const mockSupabase = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
  }),
};

function makeReq(origin = "https://app.example.com"): NextRequest {
  return new NextRequest("http://localhost/api/stripe/portal", {
    method: "POST",
    headers: { origin },
  });
}

const mockUser = { id: "user-abc", email: "test@example.com" };

describe("POST /api/stripe/portal", () => {
  let helpers: typeof import("@/lib/api/helpers");

  beforeEach(async () => {
    vi.clearAllMocks();
    helpers = await import("@/lib/api/helpers");
    vi.mocked(helpers.requireAuth).mockResolvedValue({
      user: mockUser as never,
      supabase: mockSupabase as never,
    });
    vi.mocked(helpers.apiError).mockImplementation((msg, status) =>
      new Response(JSON.stringify({ error: msg }), { status })
    );
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/test" });
    mockCustomerList.mockResolvedValue({ data: [] });
  });

  it("returns a billing portal URL for the stored customer", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://billing.stripe.com/session/test");
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_123" })
    );
  });

  it("falls back to Stripe email lookup when no row exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockCustomerList.mockResolvedValueOnce({ data: [{ id: "cus_fallback" }] });

    const { POST } = await import("./route");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_fallback" })
    );
  });

  it("returns 404 when no billing account is found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockCustomerList.mockResolvedValueOnce({ data: [] });

    const { POST } = await import("./route");
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
  });

  it("uses the request origin for return_url", async () => {
    const { POST } = await import("./route");
    await POST(makeReq("https://myapp.com"));
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ return_url: "https://myapp.com/profile" })
    );
  });
});
