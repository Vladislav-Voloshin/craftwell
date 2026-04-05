/**
 * Tests for the main chat API route — POST /api/chat
 *
 * Covers: auth, rate limiting, schema validation, session creation,
 * SSE streaming, RAG context, protocol context, error handling,
 * and post-stream DB cleanup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks (must be at top before vi.mock calls) ───────────

const { mockFrom, mockCheckRateLimit, mockGetEmbedding, mockQueryVectors, mockMessagesStream } =
  vi.hoisted(() => {
    return {
      mockFrom: vi.fn(),
      mockCheckRateLimit: vi.fn().mockResolvedValue(null),
      mockGetEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      mockQueryVectors: vi.fn().mockResolvedValue([]),
      mockMessagesStream: vi.fn(),
    };
  });

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
  getRequestId: vi.fn().mockReturnValue("req-chat-test"),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("@/lib/pinecone/client", () => ({
  queryVectors: mockQueryVectors,
}));

vi.mock("@/lib/pinecone/embeddings", () => ({
  getEmbedding: mockGetEmbedding,
  getAnthropicClient: vi.fn(() => ({
    messages: { stream: mockMessagesStream },
  })),
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

import { POST } from "./route";
import { requireAuth } from "@/lib/api/helpers";

// ── Helpers ───────────────────────────────────────────────────────

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";
const PROTOCOL_ID = "550e8400-e29b-41d4-a716-446655440002";
const NEW_SESSION_ID = "550e8400-e29b-41d4-a716-446655440099";

function makeRequest(
  body: Record<string, unknown>,
  url = "http://localhost/api/chat"
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a chainable Supabase query mock that resolves with `result`. */
function makeChain(result: { data?: unknown; error?: unknown } = {}) {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "in",
    "order",
    "insert",
    "update",
    "upsert",
    "delete",
    "gte",
    "lte",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = terminal;
  chain.limit = terminal;
  chain.maybeSingle = terminal;
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

/** Create an async iterable of Anthropic text-delta events. */
async function* makeAnthropicStream(texts: string[]) {
  for (const text of texts) {
    yield { type: "content_block_delta", delta: { type: "text_delta", text } };
  }
}

/** Drain a streaming Response and parse all SSE events from it. */
async function collectSSE(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

/** Set up the default happy-path mockFrom chain for a request WITH a session_id. */
function setupDefaultMocks(opts: { withSurvey?: { focus_areas: string[]; health_goals: string[] } } = {}) {
  const surveyData = opts.withSurvey ?? null;
  mockFrom
    .mockReturnValueOnce(makeChain({ error: null }))            // chat_messages.insert (user msg)
    .mockReturnValueOnce(makeChain({ data: [], error: null }))  // chat_messages.select (history)
    .mockReturnValueOnce(makeChain({ data: surveyData }))       // survey_responses
    .mockReturnValueOnce(makeChain({ error: null }))            // chat_messages.insert (assistant) post-stream
    .mockReturnValueOnce(makeChain({ error: null }));           // chat_sessions.update post-stream
}

/** Same but for a request WITHOUT session_id (prepends session creation). */
function setupNewSessionMocks() {
  mockFrom
    .mockReturnValueOnce(makeChain({ data: { id: NEW_SESSION_ID }, error: null })) // chat_sessions.insert
    .mockReturnValueOnce(makeChain({ error: null }))                                // chat_messages.insert (user)
    .mockReturnValueOnce(makeChain({ data: [], error: null }))                      // chat_messages.select (history)
    .mockReturnValueOnce(makeChain({ data: null }))                                 // survey_responses
    .mockReturnValueOnce(makeChain({ error: null }))                                // chat_messages.insert (assistant)
    .mockReturnValueOnce(makeChain({ error: null }));                               // chat_sessions.update
}

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/chat — auth & rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryVectors.mockResolvedValue([]);
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hi"]));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { name: "AuthError" })
    );
    const res = await POST(makeRequest({ message: "hello", session_id: SESSION_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
    mockCheckRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
    );
    const res = await POST(makeRequest({ message: "hello", session_id: SESSION_ID }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/chat — request validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("returns 400 for empty message", async () => {
    const res = await POST(makeRequest({ message: "", session_id: SESSION_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation error/i);
  });

  it("returns 400 for message exceeding 4000 chars", async () => {
    const res = await POST(
      makeRequest({ message: "x".repeat(4001), session_id: SESSION_ID })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid session_id format", async () => {
    const res = await POST(makeRequest({ message: "hi", session_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat — session management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryVectors.mockResolvedValue([]);
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("creates new session when session_id not provided", async () => {
    setupNewSessionMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hi"]));

    const res = await POST(makeRequest({ message: "hello" }));
    // Should be a streaming response
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await collectSSE(res);
    const metaEvent = events.find((e) => e.type === "meta");
    expect(metaEvent).toBeDefined();
    expect(metaEvent!.session_id).toBe(NEW_SESSION_ID);
  });

  it("reuses existing session when session_id provided", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hi"]));

    const res = await POST(makeRequest({ message: "hello", session_id: SESSION_ID }));
    expect(res.status).toBe(200);

    const events = await collectSSE(res);
    const metaEvent = events.find((e) => e.type === "meta");
    expect(metaEvent!.session_id).toBe(SESSION_ID);
  });

  it("returns 500 when session creation fails", async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: "DB error" } }));
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/chat — SSE streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryVectors.mockResolvedValue([]);
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("streams SSE events: meta → text → done", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hello", " world"]));

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");

    const events = await collectSSE(res);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("meta");
    expect(types).toContain("text");
    expect(types[types.length - 1]).toBe("done");
  });

  it("emits correct text content in text events", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hello", " world"]));

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    const events = await collectSSE(res);
    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents[0].text).toBe("Hello");
    expect(textEvents[1].text).toBe(" world");
  });

  it("includes sources in meta event from RAG matches", async () => {
    setupDefaultMocks();
    mockQueryVectors.mockResolvedValue([
      {
        id: "chunk-1",
        metadata: {
          source_type: "podcast",
          source_title: "Ep 100",
          content: "Some content",
        },
      },
    ]);
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Response"]));

    const res = await POST(makeRequest({ message: "question", session_id: SESSION_ID }));
    const events = await collectSSE(res);
    const meta = events.find((e) => e.type === "meta") as Record<string, unknown>;
    const sources = meta.sources as { type: string; title: string; chunk_id: string }[];
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe("podcast");
    expect(sources[0].title).toBe("Ep 100");
    expect(sources[0].chunk_id).toBe("chunk-1");
  });

  it("sends error event and done when Anthropic stream throws", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(
      (async function* () {
        throw new Error("Anthropic API failure");
      })()
    );

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    const events = await collectSSE(res);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toMatch(/failed to generate/i);
    // done is still sent after error
    expect(events[events.length - 1].type).toBe("done");
  });

  it("degrades gracefully when Pinecone times out (ragUnavailable)", async () => {
    setupDefaultMocks();
    mockGetEmbedding.mockRejectedValue(new Error("Embedding timed out after 5000ms"));
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Fallback"]));

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    expect(res.status).toBe(200);
    const events = await collectSSE(res);
    // Should still complete streaming with no sources
    const meta = events.find((e) => e.type === "meta") as Record<string, unknown>;
    expect(meta.sources).toEqual([]);
    expect(events[events.length - 1].type).toBe("done");

    // System prompt should contain ragUnavailable warning (check Anthropic call)
    const streamCall = mockMessagesStream.mock.calls[0][0] as { system: string };
    expect(streamCall.system).toContain("vector search is currently unavailable");
  });
});

describe("POST /api/chat — RAG and system prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryVectors.mockResolvedValue([]);
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("personalises system prompt with user survey data", async () => {
    setupDefaultMocks({ withSurvey: { focus_areas: ["sleep", "focus"], health_goals: ["better sleep"] } });
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Answer"]));

    await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));

    const streamCall = mockMessagesStream.mock.calls[0][0] as { system: string };
    expect(streamCall.system).toContain("User profile");
    expect(streamCall.system).toContain("better sleep");
    expect(streamCall.system).toContain("sleep");
    expect(streamCall.system).toContain("focus");
  });

  it("includes RAG context in system prompt when matches found", async () => {
    setupDefaultMocks();
    mockQueryVectors.mockResolvedValue([
      {
        id: "chunk-1",
        metadata: { source_type: "research", source_title: "Study", content: "Melatonin helps sleep." },
      },
    ]);
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Answer"]));

    await POST(makeRequest({ message: "sleep question", session_id: SESSION_ID }));

    const streamCall = mockMessagesStream.mock.calls[0][0] as { system: string };
    expect(streamCall.system).toContain("Melatonin helps sleep.");
    expect(streamCall.system).toContain("knowledge base");
  });

  it("includes protocol context in system prompt when protocol_id provided", async () => {
    const mockProtocol = {
      title: "Sleep Optimization",
      description: "Improve your sleep quality",
      category: "sleep",
      difficulty: "beginner",
      time_commitment: "30 min",
      protocol_tools: [
        { name: "Darkness", description: "Avoid blue light", effectiveness_rank: 1 },
      ],
    };
    // Extra query for protocol (between survey and post-stream cleanups)
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))           // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: [], error: null })) // chat_messages.select (history)
      .mockReturnValueOnce(makeChain({ data: null }))            // survey_responses
      .mockReturnValueOnce(makeChain({ data: mockProtocol }))    // protocols query
      .mockReturnValueOnce(makeChain({ error: null }))           // chat_messages.insert (assistant)
      .mockReturnValueOnce(makeChain({ error: null }));          // chat_sessions.update

    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Answer"]));

    await POST(
      makeRequest({ message: "about this protocol", session_id: SESSION_ID, protocol_id: PROTOCOL_ID })
    );

    const streamCall = mockMessagesStream.mock.calls[0][0] as { system: string };
    expect(streamCall.system).toContain("Sleep Optimization");
    expect(streamCall.system).toContain("Darkness");
    expect(streamCall.system).toContain("Avoid blue light");
  });

  it("uses prior conversation history in messages sent to Anthropic", async () => {
    const history = [
      { role: "user", content: "Previous question" },
      { role: "assistant", content: "Previous answer" },
    ];
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))                      // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: history, error: null }))       // chat_messages.select (history)
      .mockReturnValueOnce(makeChain({ data: null }))                       // survey_responses
      .mockReturnValueOnce(makeChain({ error: null }))                      // chat_messages.insert (assistant)
      .mockReturnValueOnce(makeChain({ error: null }));                     // chat_sessions.update

    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Answer"]));

    await POST(makeRequest({ message: "follow-up", session_id: SESSION_ID }));

    const streamCall = mockMessagesStream.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(streamCall.messages).toEqual(
      expect.arrayContaining([
        { role: "user", content: "Previous question" },
        { role: "assistant", content: "Previous answer" },
      ])
    );
  });

  it("applies model from ANTHROPIC_MODEL env var when set", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Response"]));
    process.env.ANTHROPIC_MODEL = "claude-test-model";

    await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));

    const streamCall = mockMessagesStream.mock.calls[0][0] as { model: string };
    expect(streamCall.model).toBe("claude-test-model");
    delete process.env.ANTHROPIC_MODEL;
  });
});

describe("POST /api/chat — post-stream cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryVectors.mockResolvedValue([]);
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "user-123" } as never,
      supabase: { from: mockFrom } as never,
    });
  });

  it("saves assistant message content after stream completes", async () => {
    setupDefaultMocks();
    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Hello", " there"]));

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    await res.text(); // drain stream

    // Verify chat_messages.insert was called twice (user + assistant)
    const insertCalls = mockFrom.mock.calls.filter(
      (_: unknown[], i: number) => i === 0 || i === 3
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not save assistant message when stream produced no content", async () => {
    // Stream that throws immediately (no content produced)
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))           // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: [], error: null })) // history
      .mockReturnValueOnce(makeChain({ data: null }))            // survey
      .mockReturnValueOnce(makeChain({ error: null }));          // chat_sessions.update (NO assistant insert)

    mockMessagesStream.mockReturnValue(
      (async function* () {
        throw new Error("Stream failed immediately");
      })()
    );

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    await res.text();

    // Only 4 from() calls expected (no assistant message insert since fullContent is empty)
    expect(mockFrom.mock.calls.length).toBe(4);
  });

  it("does not save orphaned partial message when stream fails mid-way (PB-132)", async () => {
    // Stream emits some content then throws — the partial content must NOT be
    // persisted as an assistant message (it would appear as a garbled response
    // in the user's chat history on next load).
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))           // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: [], error: null })) // history
      .mockReturnValueOnce(makeChain({ data: null }))            // survey
      .mockReturnValueOnce(makeChain({ error: null }));          // chat_sessions.update only

    mockMessagesStream.mockReturnValue(
      (async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Partial res" } };
        throw new Error("Network interrupted");
      })()
    );

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    const body = await res.text();

    // SSE stream must include an error event
    expect(body).toContain('"type":"error"');

    // Still exactly 4 from() calls — session update happens but NO assistant
    // message insert, even though fullContent is non-empty.
    expect(mockFrom.mock.calls.length).toBe(4);
  });

  it("updates session timestamp even when stream fails (PB-132)", async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))           // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: [], error: null })) // history
      .mockReturnValueOnce(makeChain({ data: null }))            // survey
      .mockReturnValueOnce(makeChain({ error: null }));          // chat_sessions.update

    mockMessagesStream.mockReturnValue(
      (async function* () {
        throw new Error("Stream failed");
      })()
    );

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    await res.text();

    // chat_sessions.update must have been called (4th from() call)
    const lastCall = mockFrom.mock.calls[mockFrom.mock.calls.length - 1];
    expect(lastCall[0]).toBe("chat_sessions");
  });

  it("skips session update when assistant message insert fails (PB-132)", async () => {
    // Message insert fails → session update must NOT run (consistent state)
    mockFrom
      .mockReturnValueOnce(makeChain({ error: null }))                  // chat_messages.insert (user)
      .mockReturnValueOnce(makeChain({ data: [], error: null }))        // history
      .mockReturnValueOnce(makeChain({ data: null }))                   // survey
      .mockReturnValueOnce(makeChain({ error: { message: "DB full" } })); // chat_messages.insert (assistant) FAILS

    mockMessagesStream.mockReturnValue(makeAnthropicStream(["Response"]));

    const res = await POST(makeRequest({ message: "hi", session_id: SESSION_ID }));
    await res.text();

    // Only 4 from() calls — session update is skipped after message insert failure
    expect(mockFrom.mock.calls.length).toBe(4);
  });
});
