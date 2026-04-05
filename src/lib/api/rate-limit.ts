import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/logger";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;

// Per-endpoint rate limits (requests per minute)
const ENDPOINT_LIMITS: Record<string, number> = {
  "/api/search": 30,
  "/api/profile": 20,
  "/api/protocols/favorites": 60,
  "/api/protocols/completions": 60,
  "/api/protocols/notes": 40,
  "/api/protocols/streaks": 40,
};

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Replaces the Supabase-backed rate_limit_log approach for checkApiRateLimit.
// Each serverless instance keeps its own window; this is intentional — per-instance
// limiting dramatically cuts DB Disk IO while still providing effective abuse protection
// (a single user hammering one endpoint hits the same warm instance repeatedly).
//
// Map key: `${userId}:${endpoint}` → sorted array of request timestamps (ms).
// Old entries are pruned on every check so memory stays bounded.

const _rateLimitWindows = new Map<string, number[]>();

function _inMemoryCheck(userId: string, endpoint: string, limit: number): boolean {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const timestamps = (_rateLimitWindows.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    _rateLimitWindows.set(key, timestamps);
    return false; // rate limited
  }

  timestamps.push(now);
  _rateLimitWindows.set(key, timestamps);
  return true; // allowed
}


/**
 * Check if a user has exceeded the rate limit using Supabase as shared state.
 * Counts recent chat_messages from the user in the last minute.
 * Works across serverless instances — no in-memory state.
 *
 * Returns null if allowed, or a Response with 429 if rate-limited.
 * Fails open: if the DB query errors, the request is allowed through.
 */
export async function checkRateLimit(
  userId: string,
  supabase: SupabaseClient
): Promise<Response | null> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  let count: number | null;
  try {
    const result = await supabase
      .from("chat_messages")
      .select("*, chat_sessions!inner(user_id)", { count: "exact", head: true })
      .eq("chat_sessions.user_id", userId)
      .eq("role", "user")
      .gte("created_at", since);

    count = result.count;
  } catch (err) {
    // Log at error level (not warn) — a broken rate limiter is a security concern.
    // Capture to Sentry so the on-call engineer is alerted (PB-134).
    logger.error({ err, userId }, "Rate limiter DB query failed, allowing request (fail-open)");
    Sentry.captureException(err, {
      extra: { userId, context: "rate-limit-db-query" },
      tags: { component: "rate-limiter" },
    });
    return null;
  }

  if ((count ?? 0) >= MAX_REQUESTS) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  return null;
}

/**
 * Generic per-user, per-endpoint rate limiter backed by in-process memory.
 * Previously used `rate_limit_log` (a Supabase table) which generated a DB read
 * + write on every API request — a top cause of Disk IO budget depletion.
 *
 * In-memory trade-off: limits are per serverless instance, not globally shared.
 * This is acceptable because: a single user abusing one endpoint hits the same
 * warm instance repeatedly, and the cost reduction is significant.
 *
 * Returns null if allowed, or a 429 Response if rate-limited.
 * The `supabase` parameter is kept for API compatibility but is no longer used.
 */
export async function checkApiRateLimit(
  userId: string,
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _supabase?: SupabaseClient
): Promise<Response | null> {
  const limit = ENDPOINT_LIMITS[endpoint] ?? 60;

  const allowed = _inMemoryCheck(userId, endpoint, limit);
  if (!allowed) {
    logger.warn({ userId, endpoint, limit }, "API rate limit exceeded (in-memory)");
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  return null;
}
