import { describe, it, expect, vi, beforeEach } from "vitest";

// Prevent the real Supabase server client (and its next/headers import) from
// loading; we exercise the pure logic and the service-role path with mocks.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const mockMaybeSingle = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
    }),
  })),
}));

vi.mock("@/lib/env", () => ({
  coreEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  })),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { computeIsPremium, getEntitlementForUser } from "./entitlements";

describe("computeIsPremium", () => {
  it("lifetime + active → premium", () => {
    expect(computeIsPremium({ plan_type: "lifetime", status: "active" })).toBe(true);
  });
  it("lifetime + canceled → not premium", () => {
    expect(computeIsPremium({ plan_type: "lifetime", status: "canceled" })).toBe(false);
  });
  it("monthly + active → premium", () => {
    expect(computeIsPremium({ plan_type: "monthly", status: "active" })).toBe(true);
  });
  it("annual + trialing → premium", () => {
    expect(computeIsPremium({ plan_type: "annual", status: "trialing" })).toBe(true);
  });
  it("monthly + past_due → not premium", () => {
    expect(computeIsPremium({ plan_type: "monthly", status: "past_due" })).toBe(false);
  });
  it("monthly + canceled → not premium", () => {
    expect(computeIsPremium({ plan_type: "monthly", status: "canceled" })).toBe(false);
  });
  it("annual + incomplete → not premium", () => {
    expect(computeIsPremium({ plan_type: "annual", status: "incomplete" })).toBe(false);
  });
  it("paused → not premium", () => {
    expect(computeIsPremium({ plan_type: "monthly", status: "paused" })).toBe(false);
  });
  it("no row → not premium", () => {
    expect(computeIsPremium(null)).toBe(false);
  });
});

describe("getEntitlementForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("maps an active monthly row to a premium entitlement", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        plan_type: "monthly",
        status: "active",
        provider: "stripe",
        current_period_end: "2026-07-01T00:00:00Z",
        cancel_at_period_end: false,
      },
      error: null,
    });
    const ent = await getEntitlementForUser("user-1");
    expect(ent.isPremium).toBe(true);
    expect(ent.planType).toBe("monthly");
    expect(ent.source).toBe("stripe");
    expect(ent.currentPeriodEnd).toBe("2026-07-01T00:00:00Z");
  });

  it("returns a free entitlement when the user has no row", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const ent = await getEntitlementForUser("user-1");
    expect(ent.isPremium).toBe(false);
    expect(ent.planType).toBe(null);
    expect(ent.source).toBe(null);
  });

  it("defaults source to stripe for legacy rows missing provider", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        plan_type: "lifetime",
        status: "active",
        provider: null,
        current_period_end: null,
        cancel_at_period_end: false,
      },
      error: null,
    });
    const ent = await getEntitlementForUser("user-1");
    expect(ent.source).toBe("stripe");
    expect(ent.isPremium).toBe(true);
  });

  it("fails closed (free) on a read error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const ent = await getEntitlementForUser("user-1");
    expect(ent.isPremium).toBe(false);
  });
});
