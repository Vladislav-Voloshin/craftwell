import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/entitlements", () => ({ getMyEntitlement: vi.fn() }));
vi.mock("@/lib/api/request-id", () => ({ getRequestId: vi.fn(() => "req-test") }));
vi.mock("@/lib/api/helpers", () => ({
  handleApiError: vi.fn(
    () => new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  ),
}));

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/entitlement", { method: "GET" });
}

describe("GET /api/entitlement", () => {
  let ent: typeof import("@/lib/entitlements");

  beforeEach(async () => {
    vi.clearAllMocks();
    ent = await import("@/lib/entitlements");
  });

  it("returns the user's entitlement", async () => {
    vi.mocked(ent.getMyEntitlement).mockResolvedValue({
      isPremium: true,
      planType: "monthly",
      status: "active",
      source: "stripe",
      currentPeriodEnd: "2026-07-01T00:00:00Z",
      cancelAtPeriodEnd: false,
    });

    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isPremium).toBe(true);
    expect(body.source).toBe("stripe");
  });

  it("returns a free entitlement for non-premium users", async () => {
    vi.mocked(ent.getMyEntitlement).mockResolvedValue({
      isPremium: false,
      planType: null,
      status: null,
      source: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const { GET } = await import("./route");
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.isPremium).toBe(false);
  });

  it("delegates unexpected errors to handleApiError (500)", async () => {
    vi.mocked(ent.getMyEntitlement).mockRejectedValue(new Error("boom"));

    const { GET } = await import("./route");
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
