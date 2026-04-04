/**
 * Tests for the protocol notes API route — GET, PUT, DELETE.
 *
 * Covers: missing params, note retrieval, upsert, deletion, and auth errors.
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
    parseBody: vi.fn(
      async (
        req: Request,
        schema: {
          safeParse: (v: unknown) => {
            success: boolean;
            data?: unknown;
            error?: { issues: { path: string[]; message: string }[] };
          };
        }
      ) => {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }
        const result = schema.safeParse(raw);
        if (!result.success) {
          const issues = result
            .error!.issues.map(
              (i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`
            )
            .join("; ");
          return new Response(JSON.stringify({ error: `Validation error: ${issues}` }), {
            status: 400,
          });
        }
        return result.data;
      }
    ),
  };
});

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-notes-test"),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, PUT, DELETE } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ───────────────────────────────────────────────────────

const PROTOCOL_ID = "550e8400-e29b-41d4-a716-446655440030";

function makeGetRequest(protocolId?: string): NextRequest {
  const url = new URL("http://localhost/api/protocols/notes");
  if (protocolId) url.searchParams.set("protocol_id", protocolId);
  return new NextRequest(url.toString(), { method: "GET" });
}

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/protocols/notes", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(protocolId?: string): NextRequest {
  const url = new URL("http://localhost/api/protocols/notes");
  if (protocolId) url.searchParams.set("protocol_id", protocolId);
  return new NextRequest(url.toString(), { method: "DELETE" });
}

function makeChain(result: { data?: unknown; error?: unknown } = {}) {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "insert", "update", "upsert", "delete"]) {
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

describe("GET /api/protocols/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns note when found", async () => {
    const mockNote = {
      id: "note-1",
      content: "My notes here",
      updated_at: "2026-03-28T10:00:00Z",
    };
    mockFrom.mockReturnValue(makeChain({ data: mockNote }));

    const res = await GET(makeGetRequest(PROTOCOL_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toEqual(mockNote);
  });

  it("returns null note when not found", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));

    const res = await GET(makeGetRequest(PROTOCOL_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBeNull();
  });

  it("returns 400 when protocol_id is missing", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/protocol_id required/i);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await GET(makeGetRequest(PROTOCOL_ID));
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/protocols/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("upserts note and returns saved data", async () => {
    const savedNote = {
      id: "note-1",
      content: "Updated content",
      updated_at: "2026-03-28T10:00:00Z",
    };
    mockFrom.mockReturnValue(makeChain({ data: savedNote, error: null }));

    const res = await PUT(makePutRequest({ protocol_id: PROTOCOL_ID, content: "Updated content" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toEqual(savedNote);
  });

  it("returns 500 when upsert fails", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: "Upsert constraint failed" } })
    );

    const res = await PUT(makePutRequest({ protocol_id: PROTOCOL_ID, content: "Content" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Upsert constraint failed");
  });

  it("returns 400 for invalid protocol_id (not UUID)", async () => {
    const res = await PUT(
      makePutRequest({ protocol_id: "not-a-uuid", content: "Content" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for content exceeding 5000 chars", async () => {
    const res = await PUT(
      makePutRequest({ protocol_id: PROTOCOL_ID, content: "x".repeat(5001) })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/protocols/notes", {
      method: "PUT",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await PUT(
      makePutRequest({ protocol_id: PROTOCOL_ID, content: "Content" })
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/protocols/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("deletes note and returns ok", async () => {
    mockFrom.mockReturnValue(makeChain({ error: null }));

    const res = await DELETE(makeDeleteRequest(PROTOCOL_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when protocol_id is missing", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/protocol_id required/i);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await DELETE(makeDeleteRequest(PROTOCOL_ID));
    expect(res.status).toBe(401);
  });
});
