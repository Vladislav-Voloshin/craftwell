/**
 * Tests for the chat sessions API route — GET, DELETE.
 *
 * Uses vi.hoisted to share mock references with vi.mock factories.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  return { mockFrom };
});

vi.mock("@/lib/api/helpers", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "user-123" },
    supabase: { from: mockFrom },
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
  parseBody: vi.fn(async (req: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { path: string[]; message: string }[] } } }) => {
    let raw: unknown;
    try { raw = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
      const issues = result.error!.issues
        .map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return new Response(JSON.stringify({ error: `Validation error: ${issues}` }), { status: 400 });
    }
    return result.data;
  }),
}));

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-test-789"),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, DELETE } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ──────────────────────────────────────────────────────

function makeRequest(method: string, url = "http://localhost/api/chat/sessions"): NextRequest {
  return new NextRequest(url, { method });
}

/** Build a chainable Supabase query mock that terminates with the given result. */
function queryChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.limit = terminal;
  chain.single = terminal;
  chain.delete = vi.fn().mockReturnValue(chain);
  // When awaited directly (e.g. await supabase.from(...).delete().eq(...))
  // the chain acts as a thenable resolving to result
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────

describe("GET /api/chat/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns sessions list with pagination metadata", async () => {
    const mockSessions = [
      { id: "s-1", title: "Chat 1", protocol_id: null, created_at: "2026-03-28", updated_at: "2026-03-28" },
      { id: "s-2", title: "Chat 2", protocol_id: null, created_at: "2026-03-27", updated_at: "2026-03-27" },
    ];
    // First call: count query, second call: data query
    mockFrom
      .mockReturnValueOnce(queryChain({ data: null, count: 2 }))
      .mockReturnValueOnce(queryChain({ data: mockSessions }));

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual(mockSessions);
    expect(body.sessions).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
  });

  it("returns empty sessions list when none exist", async () => {
    mockFrom
      .mockReturnValueOnce(queryChain({ data: null, count: 0 }))
      .mockReturnValueOnce(queryChain({ data: [] }));

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns null-safe empty list when data is null", async () => {
    mockFrom
      .mockReturnValueOnce(queryChain({ data: null, count: 0 }))
      .mockReturnValueOnce(queryChain({ data: null }));

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  it("returns messages for a specific session", async () => {
    const mockMessages = [
      { id: "m-1", role: "user", content: "Hello", sources: null, created_at: "2026-03-28" },
      { id: "m-2", role: "assistant", content: "Hi!", sources: null, created_at: "2026-03-28" },
    ];

    // First from("chat_sessions") -> session lookup
    // Second from("chat_messages") -> messages
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return queryChain({ data: { id: "s-1", user_id: "user-123" } });
      }
      return queryChain({ data: mockMessages });
    });

    const res = await GET(
      makeRequest("GET", "http://localhost/api/chat/sessions?session_id=s-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual(mockMessages);
  });

  it("returns 404 when session belongs to another user", async () => {
    mockFrom.mockReturnValue(
      queryChain({ data: { id: "s-1", user_id: "other-user" } })
    );

    const res = await GET(
      makeRequest("GET", "http://localhost/api/chat/sessions?session_id=s-1")
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when session not found", async () => {
    mockFrom.mockReturnValue(queryChain({ data: null }));

    const res = await GET(
      makeRequest("GET", "http://localhost/api/chat/sessions?session_id=s-1")
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/chat/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("deletes a session and its messages", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Session lookup
        return queryChain({ data: { id: "s-1", user_id: "user-123" } });
      }
      // All subsequent calls (delete messages, delete session) succeed
      return queryChain({ error: null });
    });

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions?id=s-1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("deleted");
  });

  it("returns 400 when id query param is missing", async () => {
    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/id query parameter/i);
  });

  it("returns 404 when session belongs to another user", async () => {
    mockFrom.mockReturnValue(
      queryChain({ data: { id: "s-1", user_id: "other-user" } })
    );

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions?id=s-1")
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when session does not exist", async () => {
    mockFrom.mockReturnValue(queryChain({ data: null }));

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions?id=nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when session delete fails", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return queryChain({ data: { id: "s-1", user_id: "user-123" } });
      }
      if (callCount === 2) {
        // delete messages succeeds
        return queryChain({ error: null });
      }
      // delete session fails
      return queryChain({ error: { message: "DB error" } });
    });

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions?id=s-1")
    );
    expect(res.status).toBe(500);
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );

    const res = await DELETE(
      makeRequest("DELETE", "http://localhost/api/chat/sessions?id=s-1")
    );
    expect(res.status).toBe(401);
  });
});
