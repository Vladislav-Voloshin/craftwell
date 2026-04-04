/**
 * Tests for the search API route.
 *
 * Mocks requireAuth, Pinecone helpers, and Supabase queries
 * to test search behaviour in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (accessible inside vi.mock factories) ─────────

const { mockSelect, mockOr, mockOrder, mockLimit, mockSupabase } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockOr = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockSupabase = {
    from: vi.fn(() => ({ select: mockSelect })),
  };
  return { mockSelect, mockOr, mockOrder, mockLimit, mockSupabase };
});

vi.mock("@/lib/api/helpers", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "user-123" },
    supabase: mockSupabase,
  }),
  apiError: vi.fn((message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status })
  ),
  handleApiError: vi.fn((err: unknown) => {
    if (err && (err as { name?: string }).name === "AuthError") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }),
}));

vi.mock("@/lib/pinecone/embeddings", () => ({
  getEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

vi.mock("@/lib/pinecone/client", () => ({
  queryVectors: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-test-123"),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET } from "./route";
import { requireAuth } from "@/lib/api/helpers";
import { queryVectors } from "@/lib/pinecone/client";

// ── Helpers ──────────────────────────────────────────────────────

function makeRequest(url: string) {
  return new Request(url) as unknown as import("next/server").NextRequest;
}

// ── Tests ────────────────────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ or: mockOr });
    mockOr.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue({ data: [], error: null });
    vi.mocked(queryVectors).mockResolvedValue([]);
  });

  it("returns 400 when q param is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/search"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 2 characters/i);
  });

  it("returns 400 when q is a single character", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?q=a"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is empty string", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?q="));
    expect(res.status).toBe(400);
  });

  it("returns results for a valid query", async () => {
    const mockProtocols = [
      { id: "1", title: "Sleep", slug: "sleep", category: "sleep" },
    ];
    mockLimit.mockResolvedValueOnce({ data: mockProtocols, error: null });

    const res = await GET(makeRequest("http://localhost/api/search?q=sleep"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual(mockProtocols);
    expect(body.knowledge).toEqual([]);
  });

  it("sanitizes special characters from query", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    await GET(makeRequest("http://localhost/api/search?q=sleep%25drop"));
    expect(mockOr).toHaveBeenCalled();
    const orArg = mockOr.mock.calls[0][0];
    expect(orArg).not.toContain("%25");
    expect(orArg).not.toContain("%%");
  });

  it("returns 400 when query is only special characters", async () => {
    const res = await GET(makeRequest("http://localhost/api/search?q=%25%25"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/searchable characters/i);
  });

  it("returns empty arrays when no matches found", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    const res = await GET(
      makeRequest("http://localhost/api/search?q=xyznonexistent")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual([]);
    expect(body.knowledge).toEqual([]);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );

    const res = await GET(makeRequest("http://localhost/api/search?q=sleep"));
    expect(res.status).toBe(401);
  });

  it("includes semantic results from Pinecone when available", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    vi.mocked(queryVectors).mockResolvedValueOnce([
      {
        id: "vec-1",
        score: 0.95,
        metadata: {
          source_type: "episode",
          source_title: "Sleep Episode",
          content: "Some content about sleep",
        },
      },
    ] as never);

    const res = await GET(makeRequest("http://localhost/api/search?q=sleep"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.knowledge).toHaveLength(1);
    expect(body.knowledge[0].source_title).toBe("Sleep Episode");
  });

  it("gracefully handles Pinecone failure and still returns protocol results", async () => {
    const mockProtocols = [
      { id: "1", title: "Sleep", slug: "sleep", category: "sleep" },
    ];
    mockLimit.mockResolvedValueOnce({ data: mockProtocols, error: null });
    vi.mocked(queryVectors).mockRejectedValueOnce(new Error("Pinecone down"));

    const res = await GET(makeRequest("http://localhost/api/search?q=sleep"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocols).toEqual(mockProtocols);
    expect(body.knowledge).toEqual([]);
  });
});
