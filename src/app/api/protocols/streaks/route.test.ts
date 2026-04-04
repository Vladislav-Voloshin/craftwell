/**
 * Tests for GET /api/protocols/streaks
 *
 * Covers: empty state, current streak calculation, longest streak,
 * yesterday/today boundary, timezone offset, and multi-protocol streaks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/api/helpers", () => {
  class AuthError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "AuthError";
    }
  }
  return {
    requireAuth: vi.fn().mockResolvedValue({
      user: { id: "user-123" },
      supabase: { from: mockFrom },
    }),
    AuthError,
    apiError: vi.fn(
      (message: string, status: number) =>
        new Response(JSON.stringify({ error: message }), { status })
    ),
    handleApiError: vi.fn((err: unknown) => {
      if (err && (err as { name?: string }).name === "AuthError") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), { status: 500 });
    }),
  };
});

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-streaks-test"),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ───────────────────────────────────────────────────────

const PROTOCOL_ID = "550e8400-e29b-41d4-a716-446655440020";
const PROTOCOL_ID_2 = "550e8400-e29b-41d4-a716-446655440021";

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/protocols/streaks");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: "GET" });
}

function makeChain(result: { data?: unknown; error?: unknown } = {}) {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "gte", "lte"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = terminal;
  chain.maybeSingle = terminal;
  chain.limit = terminal;
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

/** Generate consecutive YYYY-MM-DD strings ending on (or before) today. */
function pastDays(count: number, endDate: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(endDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates; // most recent first
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/protocols/streaks — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns empty protocols and zeros when no active protocols", async () => {
    mockFrom.mockReturnValue(makeChain({ data: [] }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual([]);
    expect(body.best_current).toBe(0);
    expect(body.best_longest).toBe(0);
  });

  it("returns empty when activeProtocols is null", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe("GET /api/protocols/streaks — streak calculation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28T12:00:00Z")); // Saturday
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current_streak=0 when no completions", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols })) // user_protocols
      .mockReturnValueOnce(makeChain({ data: [] }))              // protocol_tools
      .mockReturnValueOnce(makeChain({ data: [] }));             // protocol_completions

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(0);
    expect(body.protocols[0].longest_streak).toBe(0);
    expect(body.protocols[0].total_days).toBe(0);
  });

  it("calculates current streak starting from today", async () => {
    const today = "2026-03-28";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }]; // 1 tool
    // 5 consecutive days ending today
    const completions = pastDays(5, today).map((date) => ({
      protocol_id: PROTOCOL_ID,
      completed_date: date,
    }));

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(5);
    expect(body.protocols[0].total_days).toBe(5);
    expect(body.best_current).toBe(5);
  });

  it("calculates current streak starting from yesterday", async () => {
    const yesterday = "2026-03-27";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }];
    // 3 days consecutive ending yesterday (today not done yet)
    const completions = pastDays(3, yesterday).map((date) => ({
      protocol_id: PROTOCOL_ID,
      completed_date: date,
    }));

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(3);
  });

  it("breaks current streak when most recent completion is 2+ days ago", async () => {
    const twoDaysAgo = "2026-03-26";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }];
    const completions = pastDays(5, twoDaysAgo).map((date) => ({
      protocol_id: PROTOCOL_ID,
      completed_date: date,
    }));

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(0);
    // longest should still be 5
    expect(body.protocols[0].longest_streak).toBe(5);
  });

  it("calculates longest streak correctly with a gap", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }];
    // 7 days ago → 5 days ago (3 consecutive), then gap, then yesterday + today (2 consecutive)
    const completions = [
      { protocol_id: PROTOCOL_ID, completed_date: "2026-03-28" }, // today
      { protocol_id: PROTOCOL_ID, completed_date: "2026-03-27" }, // yesterday
      // gap on 2026-03-26
      { protocol_id: PROTOCOL_ID, completed_date: "2026-03-25" },
      { protocol_id: PROTOCOL_ID, completed_date: "2026-03-24" },
      { protocol_id: PROTOCOL_ID, completed_date: "2026-03-23" },
    ];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(2);
    expect(body.protocols[0].longest_streak).toBe(3);
  });

  it("requires all tools completed to count a date as full", async () => {
    const today = "2026-03-28";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    // 2 tools required
    const toolCounts = [
      { protocol_id: PROTOCOL_ID },
      { protocol_id: PROTOCOL_ID },
    ];
    // Only 1 completion today — not "full"
    const completions = [
      { protocol_id: PROTOCOL_ID, completed_date: today },
    ];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.protocols[0].current_streak).toBe(0);
    expect(body.protocols[0].total_days).toBe(0);
  });

  it("tracks best_current and best_longest across multiple protocols", async () => {
    const today = "2026-03-28";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
      {
        protocol_id: PROTOCOL_ID_2,
        protocols: { id: PROTOCOL_ID_2, title: "Focus", slug: "focus" },
      },
    ];
    const toolCounts = [
      { protocol_id: PROTOCOL_ID },
      { protocol_id: PROTOCOL_ID_2 },
    ];
    // Protocol 1: 3-day streak; Protocol 2: 7-day streak
    const p1completions = pastDays(3, today).map((d) => ({
      protocol_id: PROTOCOL_ID,
      completed_date: d,
    }));
    const p2completions = pastDays(7, today).map((d) => ({
      protocol_id: PROTOCOL_ID_2,
      completed_date: d,
    }));

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: [...p1completions, ...p2completions] }));

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.best_current).toBe(7);
    expect(body.best_longest).toBe(7);
    expect(body.protocols).toHaveLength(2);
  });
});

describe("GET /api/protocols/streaks — timezone handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
    mockFrom.mockReturnValue(makeChain({ data: [] }));
  });

  it("accepts tz_offset param without error", async () => {
    const res = await GET(makeRequest({ tz_offset: "-300" })); // UTC-5
    expect(res.status).toBe(200);
  });

  it("accepts positive tz_offset (behind UTC)", async () => {
    const res = await GET(makeRequest({ tz_offset: "480" })); // UTC+8
    expect(res.status).toBe(200);
  });
});
