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
 * Generic per-user, per-endpoint rate limiter backed by `rate_limit_log`.
 * Logs each request and rejects when the per-minute limit is exceeded.
 *
 * Returns null if allowed, or a 429 Response if rate-limited.
 * Fails open on DB error (same policy as the chat rate limiter).
 */
export async function checkApiRateLimit(
  userId: string,
  endpoint: string,
  supabase: SupabaseClient
): Promise<Response | null> {
  const limit = ENDPOINT_LIMITS[endpoint] ?? 60;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  try {
    const { count, error: countErr } = await supabase
      .from("rate_limit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .gte("created_at", since);

    if (countErr) throw countErr;

    if ((count ?? 0) >= limit) {
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

    // Record this request (fire-and-forget — don't block the response)
    supabase
      .from("rate_limit_log")
      .insert({ user_id: userId, endpoint })
      .then(({ error }) => {
        if (error) {
          logger.warn({ error, userId, endpoint }, "Failed to insert rate_limit_log entry");
        }
      });
  } catch (err) {
    logger.error({ err, userId, endpoint }, "API rate limiter DB query failed, allowing request (fail-open)");
    Sentry.captureException(err, {
      extra: { userId, endpoint, context: "api-rate-limit" },
      tags: { component: "rate-limiter" },
    });
  }

  return null;
}
