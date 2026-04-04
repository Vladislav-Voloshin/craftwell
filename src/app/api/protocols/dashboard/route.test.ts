/**
 * Tests for GET /api/protocols/dashboard
 *
 * Covers: empty state, week date calculation, adherence percentages,
 * tool count mapping, completion tracking, and auth errors.
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
  getRequestId: vi.fn().mockReturnValue("req-dashboard-test"),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ───────────────────────────────────────────────────────

const PROTOCOL_ID = "550e8400-e29b-41d4-a716-446655440010";

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/protocols/dashboard");
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

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/protocols/dashboard — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns empty protocols list when user has no active protocols", async () => {
    mockFrom.mockReturnValue(makeChain({ data: [] }));

    const res = await GET(makeRequest({ week: "2026-03-23" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual([]);
    expect(body.overall_adherence).toBe(0);
    expect(body.dates).toHaveLength(7);
  });

  it("returns empty list when activeProtocols is null", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));

    const res = await GET(makeRequest({ week: "2026-03-23" }));
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

describe("GET /api/protocols/dashboard — week date generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
    mockFrom.mockReturnValue(makeChain({ data: [] }));
  });

  it("uses provided week param to set week_start", async () => {
    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    expect(body.week_start).toBe("2026-03-23");
    expect(body.dates).toHaveLength(7);
    expect(body.dates[0]).toBe("2026-03-23");
    expect(body.dates[6]).toBe("2026-03-29");
  });

  it("generates 7 consecutive dates from week_start", async () => {
    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    const dates: string[] = body.dates;
    for (let i = 1; i < dates.length; i++) {
      const diff =
        new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime();
      expect(diff).toBe(86400000); // exactly 1 day in ms
    }
  });

  it("falls back to current week when no week param provided", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.dates).toHaveLength(7);
    expect(body.week_start).toBeTruthy();
  });

  it("ignores malformed week param and uses current week", async () => {
    const res = await GET(makeRequest({ week: "not-a-date" }));
    const body = await res.json();
    expect(body.dates).toHaveLength(7);
  });

  it("applies tz_offset when calculating current week", async () => {
    // Offset of -480 = UTC+8 (Asia), should not throw
    const res = await GET(makeRequest({ tz_offset: "-480" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/protocols/dashboard — completion tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns 100% adherence when all tools completed every day", async () => {
    const week = "2026-03-23";
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [
      { protocol_id: PROTOCOL_ID },
      { protocol_id: PROTOCOL_ID },
    ]; // 2 tools
    // All 7 days fully completed (2 completions each)
    const completions = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-03-23T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return [
        { protocol_id: PROTOCOL_ID, tool_id: "t1", completed_date: date },
        { protocol_id: PROTOCOL_ID, tool_id: "t2", completed_date: date },
      ];
    }).flat();

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))  // user_protocols
      .mockReturnValueOnce(makeChain({ data: toolCounts }))        // protocol_tools
      .mockReturnValueOnce(makeChain({ data: completions }));      // protocol_completions

    const res = await GET(makeRequest({ week }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall_adherence).toBe(100);
    expect(body.protocols[0].daily).toHaveLength(7);
    expect(body.protocols[0].daily[0].percentage).toBe(100);
  });

  it("returns 0% adherence when no completions", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }]; // 1 tool

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: [] })); // no completions

    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    expect(body.overall_adherence).toBe(0);
    expect(body.protocols[0].daily.every((d: { percentage: number }) => d.percentage === 0)).toBe(
      true
    );
  });

  it("calculates partial adherence correctly", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];
    const toolCounts = [
      { protocol_id: PROTOCOL_ID },
      { protocol_id: PROTOCOL_ID },
    ]; // 2 tools
    // Only day 1 completed (1 of 2 tools = 50%)
    const completions = [
      { protocol_id: PROTOCOL_ID, tool_id: "t1", completed_date: "2026-03-23" },
    ];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: completions }));

    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    const day1 = body.protocols[0].daily[0];
    expect(day1.completed).toBe(1);
    expect(day1.total).toBe(2);
    expect(day1.percentage).toBe(50);
  });

  it("defaults tool count to 1 when no tools found for protocol", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep", slug: "sleep" },
      },
    ];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: [] })) // no tools
      .mockReturnValueOnce(makeChain({ data: [] })); // no completions

    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    expect(body.protocols[0].total_tools).toBe(1);
  });

  it("includes all protocol metadata in response", async () => {
    const activeProtocols = [
      {
        protocol_id: PROTOCOL_ID,
        protocols: { id: PROTOCOL_ID, title: "Sleep Protocol", slug: "sleep-protocol" },
      },
    ];
    const toolCounts = [{ protocol_id: PROTOCOL_ID }];

    mockFrom
      .mockReturnValueOnce(makeChain({ data: activeProtocols }))
      .mockReturnValueOnce(makeChain({ data: toolCounts }))
      .mockReturnValueOnce(makeChain({ data: [] }));

    const res = await GET(makeRequest({ week: "2026-03-23" }));
    const body = await res.json();
    expect(body.protocols[0].protocol_id).toBe(PROTOCOL_ID);
    expect(body.protocols[0].title).toBe("Sleep Protocol");
    expect(body.protocols[0].slug).toBe("sleep-protocol");
  });
});
