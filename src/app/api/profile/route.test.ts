/**
 * Tests for the profile API route — GET, PUT, DELETE.
 *
 * Mocks requireAuth, Supabase client, and the admin client
 * to test profile operations in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────

const {
  mockDeleteUser,
  profileChain,
  surveyChain,
  completionsChain,
  userProtocolsChain,
  chatSessionsChain,
  chatMessagesChain,
  mockSupabase,
  resetChains,
} = vi.hoisted(() => {
  function chainableMock() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.update = vi.fn().mockReturnValue(chain);
    chain.upsert = vi.fn().mockResolvedValue({ error: null });
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    return chain;
  }

  const profileChain = chainableMock();
  const surveyChain = chainableMock();
  const completionsChain = chainableMock();
  const userProtocolsChain = chainableMock();
  const chatSessionsChain = chainableMock();
  const chatMessagesChain = chainableMock();

  const mockSupabase = {
    from: vi.fn((table: string) => {
      switch (table) {
        case "users": return profileChain;
        case "survey_responses": return surveyChain;
        case "protocol_completions": return completionsChain;
        case "user_protocols": return userProtocolsChain;
        case "chat_sessions": return chatSessionsChain;
        case "chat_messages": return chatMessagesChain;
        default: return chainableMock();
      }
    }),
  };

  const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });

  function resetChains() {
    for (const chain of [profileChain, surveyChain, completionsChain, userProtocolsChain, chatSessionsChain, chatMessagesChain]) {
      for (const key of Object.keys(chain)) {
        chain[key].mockClear();
        if (key === "single" || key === "maybeSingle") {
          chain[key].mockResolvedValue({ data: null, error: null });
        } else if (key === "upsert") {
          chain[key].mockResolvedValue({ error: null });
        } else if (key === "limit") {
          chain[key].mockResolvedValue({ data: [], error: null });
        } else {
          chain[key].mockReturnValue(chain);
        }
      }
    }
  }

  return { mockDeleteUser, profileChain, surveyChain, completionsChain, userProtocolsChain, chatSessionsChain, chatMessagesChain, mockSupabase, resetChains };
});

vi.mock("@/lib/api/helpers", () => {
  class AuthError extends Error {
    constructor() { super("Unauthorized"); this.name = "AuthError"; }
  }
  return {
    requireAuth: vi.fn().mockResolvedValue({
      user: { id: "user-123" },
      supabase: mockSupabase,
    }),
    AuthError,
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
  };
});

vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn().mockReturnValue("req-test-456"),
}));

vi.mock("@/lib/env", () => ({
  coreEnv: vi.fn().mockReturnValue({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    auth: { admin: { deleteUser: (...args: unknown[]) => mockDeleteUser(...args) } },
  }),
}));

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

vi.mock("@/lib/logger", () => ({
  default: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, PUT, DELETE } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ──────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest("http://localhost/api/profile", init);
}

// ── Tests ────────────────────────────────────────────────────────

describe("GET /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: mockSupabase as never,
    });
  });

  it("returns user profile and survey data", async () => {
    const mockProfile = { id: "user-123", display_name: "Test User" };
    const mockSurvey = { user_id: "user-123", health_goals: ["sleep"] };

    profileChain.single.mockResolvedValueOnce({ data: mockProfile, error: null });
    surveyChain.maybeSingle.mockResolvedValueOnce({ data: mockSurvey, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toEqual(mockProfile);
    expect(body.survey).toEqual(mockSurvey);
  });

  it("returns null survey when user has none", async () => {
    profileChain.single.mockResolvedValueOnce({ data: { id: "user-123" }, error: null });
    surveyChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.survey).toBeNull();
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: mockSupabase as never,
    });
  });

  it("updates profile fields successfully", async () => {
    profileChain.eq.mockResolvedValueOnce({ error: null });

    const req = makeRequest("PUT", { profile: { display_name: "New Name" } });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.profile).toBe("updated");
  });

  it("updates survey fields successfully", async () => {
    surveyChain.upsert.mockResolvedValueOnce({ error: null });

    const req = makeRequest("PUT", { survey: { health_goals: ["focus", "sleep"] } });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.survey).toBe("updated");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const req = makeRequest("PUT", { profile: { display_name: "X" } });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: mockSupabase as never,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it("deletes user auth and data successfully", async () => {
    chatSessionsChain.eq.mockResolvedValueOnce({ data: [], error: null });

    const req = makeRequest("DELETE");
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("deleted");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-123");
  });

  it("deletes chat messages when sessions exist", async () => {
    chatSessionsChain.eq.mockResolvedValueOnce({
      data: [{ id: "sess-1" }, { id: "sess-2" }],
      error: null,
    });

    const req = makeRequest("DELETE");
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("chat_messages");
  });

  it("returns 500 when auth deletion fails", async () => {
    // Auth deletion now happens LAST (after data cleanup)
    // Mock data deletions as successful, then auth fails
    mockDeleteUser.mockResolvedValueOnce({ error: { message: "Admin auth failed" } });

    const req = makeRequest("DELETE");
    const res = await DELETE(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("auth removal failed");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const req = makeRequest("DELETE");
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });
});
