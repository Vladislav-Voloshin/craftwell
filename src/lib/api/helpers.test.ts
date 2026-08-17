import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthError,
  apiError,
  handleApiError,
  parseBody,
} from "./helpers";
import { NextRequest } from "next/server";
import { z } from "zod";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

describe("AuthError", () => {
  it("has correct name and message", () => {
    const err = new AuthError();
    expect(err.name).toBe("AuthError");
    expect(err.message).toBe("Unauthorized");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("apiError", () => {
  it("returns a JSON response with the given message and status", async () => {
    const response = apiError("Not found", 404);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 400 for validation errors", async () => {
    const response = apiError("Validation error: name is required", 400);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Validation error");
  });

  it("returns 500 for server errors", async () => {
    const response = apiError("Internal server error", 500);
    expect(response.status).toBe(500);
  });
});

describe("handleApiError", () => {
  it("returns 401 for AuthError", async () => {
    const response = handleApiError(new AuthError());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 for generic errors in production", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const response = handleApiError(new Error("db connection failed"));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Internal server error" });
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("returns actual error message in development", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const response = handleApiError(new Error("db connection failed"));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "db connection failed" });
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("converts non-Error values to string", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const response = handleApiError("string error");
      const body = await response.json();
      expect(body).toEqual({ error: "string error" });
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("passes requestId to logger", () => {
    const response = handleApiError(new Error("test"), "req-123");
    expect(response.status).toBe(500);
  });
});

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns user and supabase client when session is valid", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
    };
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

    const { requireAuth: fn } = await import("./helpers");
    const result = await fn();
    expect(result.user).toEqual(mockUser);
    expect(result.supabase).toBe(mockSupabase);
  });

  it("throws AuthError when no user in session", async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

    const { requireAuth: fn, AuthError: AuthErr } = await import("./helpers");
    await expect(fn()).rejects.toThrow("Unauthorized");
    await expect(fn()).rejects.toBeInstanceOf(AuthErr);
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns parsed data when body matches schema", async () => {
    const req = makeRequest({ name: "Alice", age: 30 });
    const result = await parseBody(req, schema);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("returns 400 Response when JSON is invalid", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-valid-json{{{",
    });
    const result = await parseBody(req, schema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    const body = await (result as Response).json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 Response when schema validation fails", async () => {
    const req = makeRequest({ name: "Alice" });
    const result = await parseBody(req, schema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    const body = await (result as Response).json();
    expect(body.error).toContain("Validation error");
  });

  it("returns 400 Response with field path for nested validation failure", async () => {
    const nestedSchema = z.object({
      user: z.object({ email: z.string().email() }),
    });
    const req = makeRequest({ user: { email: "not-an-email" } });
    const result = await parseBody(req, nestedSchema);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    const body = await (result as Response).json();
    expect(body.error).toContain("Validation error");
    expect(body.error).toContain("user.email");
  });
});
