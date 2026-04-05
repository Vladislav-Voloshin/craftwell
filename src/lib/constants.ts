/**
 * Application-wide constants (PB-142)
 *
 * Central source of truth for all magic numbers: rate limits, timeouts,
 * retries, page sizes, and other tunable values.
 * Import from here rather than hardcoding values in individual files.
 */

// ── Rate Limiting ──────────────────────────────────────────────────────────
/** Rolling window for rate limit checks (ms) */
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
/** Max requests allowed per user within RATE_LIMIT_WINDOW_MS */
export const RATE_LIMIT_MAX_REQUESTS = 20;

// ── Chat ───────────────────────────────────────────────────────────────────
/** Max characters allowed in a single chat message */
export const CHAT_MAX_MESSAGE_LENGTH = 4000;
/** Number of prior turns (user+assistant pairs) sent as conversation context */
export const CHAT_MAX_HISTORY_TURNS = 20;
/** Max characters in a new session title (truncated from first message) */
export const CHAT_SESSION_TITLE_MAX_LENGTH = 50;
/** Max title length when renaming a session */
export const CHAT_SESSION_RENAME_MAX_LENGTH = 200;

// ── Vector Search / RAG ────────────────────────────────────────────────────
/** Timeout for Pinecone embedding + query operations (ms) */
export const PINECONE_TIMEOUT_MS = 5_000;
/** Number of nearest-neighbour results to fetch from Pinecone */
export const PINECONE_TOP_K = 5;

// ── Pagination ─────────────────────────────────────────────────────────────
/** Default page size for protocol text search results */
export const SEARCH_TEXT_PAGE_SIZE = 20;
/** Default page size for Pinecone semantic search results */
export const SEARCH_VECTOR_PAGE_SIZE = 10;
/** Number of related protocols shown on a protocol detail page */
export const RELATED_PROTOCOLS_COUNT = 4;

// ── AI Model ───────────────────────────────────────────────────────────────
/** Max tokens the model should generate per response */
export const CHAT_MAX_TOKENS = 1024;

// ── Retries ────────────────────────────────────────────────────────────────
/** Number of retry attempts for transient network errors */
export const DEFAULT_RETRY_ATTEMPTS = 3;
/** Delay between retries (ms) */
export const DEFAULT_RETRY_DELAY_MS = 1_500;
