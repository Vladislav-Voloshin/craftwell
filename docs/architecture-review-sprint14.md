# Craftwell Architecture Review -- Sprint 14

**Author:** Architect (ARCH)
**Date:** 2026-03-28
**Scope:** Security Audit, Database Schema Review, AI Cost Modeling

---

## Sprint 15 Changes (2026-03-29)

The following architectural changes were introduced during Sprint 15 and should be considered alongside the findings below.

### Branching and Deployment Flow

Development now follows a `dev -> main` branching model. Feature branches are merged into `dev` first, which triggers a Vercel preview deployment. Merges from `dev` to `main` trigger the production deployment at craftwell.vercel.app. This replaces the previous workflow where feature branches merged directly into `main`.

### Health Monitoring Dashboard

A new public health check endpoint (`GET /api/health`) reports the connectivity status of Supabase, Pinecone, and Anthropic. It returns 200 when all services are healthy, 503 when any service is degraded or unreachable. An admin dashboard at `/admin/health` consumes this endpoint, displaying per-service latency, uptime, and auto-refreshing every 30 seconds.

### Graceful Degradation for Pinecone

The chat and search routes now handle Pinecone failures gracefully. When Pinecone is unreachable, the system continues to function using only Supabase data rather than returning a 500 error. This improves availability when the vector search service has transient outages.

### Pagination on Chat Sessions and Completions

`GET /api/chat/sessions` and `GET /api/protocols/completions` now accept `offset` and `limit` query parameters, allowing the frontend to paginate through large result sets instead of loading everything at once. This addresses the scale concerns raised in Finding D-1 and the dashboard aggregation rows in Section 2.3.

### Chat Context Bug Fixes

Several bugs were fixed in the chat route related to conversation context handling. The N+1 query pattern for loading chat history was resolved by joining sessions and messages in a single query. Protocol context injection was also fixed to pass the correct protocol data to the AI system prompt.

### Logger Migration (console to pino)

All `console.log`, `console.warn`, and `console.error` calls across API routes and library code have been replaced with a structured `pino` logger (`src/lib/logger.ts`). In production, logs are emitted as JSON for machine parsing. In development, `pino-pretty` provides colorized human-readable output. The log level is controlled by the `LOG_LEVEL` environment variable (defaults to `info` in production, `debug` in development).

### ANTHROPIC_MODEL Environment Variable

The Claude model used for chat is now configurable via the `ANTHROPIC_MODEL` environment variable instead of being hardcoded. This makes it easier to switch between Sonnet, Haiku, and Opus without code changes, partially addressing cost optimization recommendation OPT-4 from Section 3.8.

---

## 1. Security Audit

### 1.1 Methodology

Every file under `src/app/api/` was read and analyzed for input validation, authentication enforcement, data exposure, injection risks, and rate limiting. Supporting library code in `src/lib/api/` was also reviewed.

### 1.2 Authentication Architecture

Authentication is handled via `requireAuth()` in `src/lib/api/helpers.ts`, which calls `supabase.auth.getUser()` and throws `AuthError` if no session exists. The `handleApiError()` catch-all converts `AuthError` into a 401 response. This pattern is used consistently across all user-facing routes.

The one exception is `/api/ingest`, which uses a separate `ADMIN_API_KEY` bearer-token scheme, appropriate for admin-only ingestion operations.

### 1.3 Findings Table

| Route | Method | Auth | Input Validation | Injection Risk | Rate Limit | Data Exposure | Severity |
|---|---|---|---|---|---|---|---|
| `/api/chat` | POST | requireAuth | Zod schema (message 1-4000 chars, session_id uuid, protocol_id uuid) | LOW -- user input passed to embedding/LLM, not raw SQL | checkRateLimit (20/min) | Sources array returned is minimal | LOW |
| `/api/chat/search` | GET | requireAuth | query param validated (min 2 chars) | **MEDIUM** -- raw `query` interpolated into `.ilike("content", pattern)` via `%${query}%`. Supabase parameterizes ilike, but `%` and `_` wildcard chars in user input are not escaped, enabling wildcard abuse | None | Snippet extraction is bounded (80 chars) | MEDIUM |
| `/api/chat/sessions` | GET | requireAuth | session_id from query param, ownership verified | LOW | None | Messages include full content + sources | LOW |
| `/api/chat/sessions` | PATCH | requireAuth | Zod schema (session_id uuid, title 1-200) | LOW | None | Minimal response | LOW |
| `/api/chat/sessions` | DELETE | requireAuth | id query param required, ownership verified | LOW | None | Minimal response | LOW |
| `/api/ingest` | POST | Bearer token (ADMIN_API_KEY) | **NONE** -- `step` field parsed from raw `request.json()` with no Zod validation | LOW -- step is used in a switch, not in queries | None | Error messages leak stack traces in dev | MEDIUM |
| `/api/profile` | GET | requireAuth | None needed (reads own profile) | LOW | None | **HIGH** -- `SELECT *` returns all user columns including email, phone, avatar_url | MEDIUM |
| `/api/profile` | PUT | requireAuth | Zod schema with strict field limits | LOW | None | Minimal response | LOW |
| `/api/profile` | DELETE | requireAuth | None needed (deletes own account) | LOW | None | Service-role key used for auth.admin.deleteUser | LOW |
| `/api/profile/achievements` | GET | requireAuth | None needed | LOW | None | Achievement definitions are hardcoded, data is own-user only | LOW |
| `/api/protocols/completions` | GET | requireAuth | protocol_id required, type param checked | LOW | None | Own-user data only | LOW |
| `/api/protocols/completions` | POST | requireAuth | Zod schema (protocol_id uuid, tool_id uuid, tz_offset int) | LOW | None | Minimal response | LOW |
| `/api/protocols/dashboard` | GET | requireAuth | week param regex-validated, tz_offset parsed | LOW | None | Own-user data only | LOW |
| `/api/protocols/export` | GET | requireAuth | None needed | LOW | None | CSV of own data -- appropriate | LOW |
| `/api/protocols/favorites` | GET | requireAuth | None needed | LOW | None | Own-user favorites only | LOW |
| `/api/protocols/favorites` | POST | requireAuth | Zod schema (protocol_id uuid) | LOW | None | Minimal response | LOW |
| `/api/protocols/notes` | GET | requireAuth | protocol_id required | LOW | None | Own-user note only | LOW |
| `/api/protocols/notes` | PUT | requireAuth | Zod schema (protocol_id uuid, content max 5000) | LOW | None | Returns saved note | LOW |
| `/api/protocols/notes` | DELETE | requireAuth | protocol_id required | LOW | None | Minimal response | LOW |
| `/api/protocols/streaks` | GET | requireAuth | None needed beyond auth | LOW | None | Own-user data only | LOW |
| `/api/protocols/user` | GET | requireAuth | None needed | LOW | None | Returns joined protocol data -- appropriate | LOW |
| `/api/protocols/user` | POST | requireAuth | Zod schema (protocol_id uuid, action enum) | LOW | None | Minimal response | LOW |
| `/api/search` | GET | requireAuth | query min 2 chars; special chars stripped | **MEDIUM** -- stripped query still interpolated into `.or()` filter string: `title.ilike.%${q}%,description.ilike.%${q}%`. While dangerous chars are stripped, this is a fragile approach | None | Content truncated to 300 chars | MEDIUM |

### 1.4 Critical Findings

**FINDING S-1: No rate limiting on most routes (HIGH)**
Only `/api/chat` has rate limiting (20 messages/minute). All other routes -- including search, profile updates, protocol completions, favorites, notes, and session management -- have no rate limiting. An authenticated attacker could:
- Enumerate all protocols via rapid search queries
- Create thousands of chat sessions or completions
- Export data repeatedly
- **Recommendation:** Add middleware-level rate limiting (e.g., Vercel Edge rate limit or `next-rate-limit`) across all API routes, with tiered limits (stricter for writes, more generous for reads).

**FINDING S-2: PostgREST filter injection risk in /api/search (MEDIUM)**
The search route at line 39 constructs a PostgREST `.or()` filter by interpolating user input:
```
.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
```
While the code strips `%`, `_`, `()`, `,`, `.`, `"`, `'`, and `\` characters, this is a denylist approach. If Supabase/PostgREST introduces new syntax characters in future versions, the filter could be subverted.
- **Recommendation:** Switch to two separate `.ilike()` calls combined with OR logic at the application level, or use `.textSearch()` for full-text search.

**FINDING S-3: Wildcard abuse in /api/chat/search (MEDIUM)**
The chat search route uses `%${query}%` directly without escaping `%` or `_` characters in the user's query. While Supabase parameterizes the value, PostgreSQL LIKE wildcards within the value still work, allowing pattern-based enumeration.
- **Recommendation:** Escape `%` and `_` in the query before constructing the ilike pattern.

**FINDING S-4: /api/ingest has no input validation (MEDIUM)**
The `step` field from the request body is not validated with Zod. While it is used only in a switch statement (no injection risk), malformed JSON or unexpected fields are silently accepted.
- **Recommendation:** Add a Zod schema with `z.enum(["scrape-podcasts", "scrape-newsletters", ...])`.

**FINDING S-5: /api/profile GET returns SELECT * (LOW-MEDIUM)**
The profile GET handler uses `select("*")` on the users table, returning all columns. This currently includes `id`, `email`, `phone`, `avatar_url`, `created_at`, and `updated_at`. While this is the user's own data, returning `*` is risky because future columns (e.g., internal flags, hashed values) would be auto-exposed.
- **Recommendation:** Explicitly list returned columns: `select("id, email, display_name, first_name, last_name, age, avatar_url, onboarding_completed")`.

**FINDING S-6: No CSRF protection on state-changing routes (LOW)**
POST/PUT/DELETE routes rely solely on the Supabase session cookie for authentication. While Next.js API routes with `SameSite=Lax` cookies have some inherent CSRF protection, explicit CSRF tokens or checking the `Origin`/`Referer` header would add defense-in-depth.
- **Recommendation:** Consider adding origin validation middleware for state-changing requests.

**FINDING S-7: Error messages leak internal details in development (LOW)**
`handleApiError()` and the ingest route return raw error messages when `NODE_ENV !== "production"`. This is acceptable for development but ensure `NODE_ENV=production` is always set on Vercel.
- **Recommendation:** Verify Vercel environment configuration.

### 1.5 Positive Security Observations

- All user-facing routes consistently use `requireAuth()` -- no auth bypass found.
- Ownership checks (e.g., `session.user_id !== user.id`) are present on session operations.
- Zod validation is used on all POST/PUT/PATCH bodies (except ingest).
- RLS policies provide defense-in-depth at the database layer.
- Supabase client uses parameterized queries, preventing classical SQL injection.
- The chat rate limiter uses database state (not in-memory), so it works across serverless instances.
- Error reporting goes to Sentry with request IDs for traceability.
- Content tables (chunks, episodes, newsletters) had public read access removed in migration 002.

---

## 2. Database Schema Review

### 2.1 Schema Overview

The schema consists of 12 tables across 6 migration files plus 1 standalone script:

| Table | Purpose | RLS | Indexes |
|---|---|---|---|
| `users` | User profiles (extends auth.users) | Yes (CRUD own) | PK only |
| `survey_responses` | Onboarding survey | Yes (CRUD own) | PK + unique(user_id) |
| `protocol_categories` | Category taxonomy | Yes (public read) | PK only |
| `protocols` | Protocol definitions | Yes (public read) | category, effectiveness_rank |
| `protocol_tools` | Steps within protocols | Yes (public read) | protocol_id |
| `protocol_completions` | Daily checklist tracking | Yes (select/insert/delete own) | (user_id, protocol_id, completed_date), (user_id, protocol_id, completed_date DESC) |
| `protocol_favorites` | Bookmarked protocols | Yes (select/insert/delete own) | user_id |
| `protocol_notes` | User notes on protocols | Yes (CRUD own) | PK + unique(user_id, protocol_id) |
| `user_protocols` | Adopted protocols | Yes (CRUD own) | PK + unique(user_id, protocol_id) |
| `chat_sessions` | Chat conversations | Yes (CRUD own) | user_id |
| `chat_messages` | Individual messages | Yes (select/insert via session ownership) | session_id |
| `podcast_episodes` | Scraped podcast data | Yes (public read removed in 002) | ingested |
| `newsletters` | Scraped newsletter data | Yes (public read removed in 002) | ingested |
| `content_chunks` | RAG chunks | Yes (public read removed in 002) | (source_type, source_id), pinecone_id |

### 2.2 Findings

**FINDING D-1: Missing index on chat_messages.created_at (HIGH)**
The chat search route (`/api/chat/search`) queries `chat_messages` with `.ilike("content", pattern)` and `.order("created_at", { ascending: false })`. The completions route also fetches history ordered by `created_at`. Without an index on `created_at`, these queries degrade to sequential scans at scale.
- **Recommendation:** `CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);`

**FINDING D-2: Missing index on user_protocols(user_id) (HIGH)**
The dashboard, streaks, and user protocol routes all query `user_protocols` filtered by `user_id` and `is_active`. No index exists on this table beyond the PK and unique constraint on `(user_id, protocol_id)`.
- **Recommendation:** `CREATE INDEX idx_user_protocols_user_active ON user_protocols(user_id) WHERE is_active = true;` (partial index)

**FINDING D-3: Missing index on protocol_favorites(user_id, protocol_id) (MEDIUM)**
The favorites route checks for existing favorites with `.eq("user_id", ...).eq("protocol_id", ...)`. While there is a unique constraint, an explicit index on `(user_id, protocol_id)` ensures the unique constraint is backed by a B-tree (PostgreSQL does this automatically for UNIQUE constraints, so this is actually covered -- no action needed).

**FINDING D-4: No index on chat_messages.content for text search (MEDIUM)**
The chat search route uses `.ilike("content", pattern)` which performs a sequential scan on message content. At 20K users with potentially hundreds of messages each, this becomes very expensive.
- **Recommendation:** Add a GIN trigram index: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_chat_messages_content_trgm ON chat_messages USING gin(content gin_trgm_ops);` or switch to PostgreSQL full-text search with a `tsvector` column.

**FINDING D-5: protocol_completions not in supabase/migrations/ (MEDIUM)**
The `protocol_completions` table is defined in `scripts/create-completions-table.sql` instead of the `supabase/migrations/` directory. This means it is not tracked by the Supabase migration system and could be missed during fresh deployments.
- **Recommendation:** Move this to a numbered migration file (e.g., `006_protocol_completions.sql`).

**FINDING D-6: Duplicate migration files for protocol_favorites (LOW)**
Both `003_protocol_favorites.sql` and `004_protocol_favorites.sql` define the same table. The `004` version appears to be the canonical one (used in `supabase/migrations/`), while `003` is a duplicate. This could cause errors on fresh migrations.
- **Recommendation:** Remove the duplicate or consolidate migration numbering.

**FINDING D-7: Missing DELETE RLS policy on chat_messages (MEDIUM)**
The `chat_messages` table has RLS policies for SELECT and INSERT but no DELETE policy. The session delete handler in `/api/chat/sessions` deletes messages via the user's Supabase client. Without a DELETE policy, this operation would be silently blocked by RLS.
- **Recommendation:** Add a DELETE policy: `CREATE POLICY messages_delete ON public.chat_messages FOR DELETE USING (session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()));`

**FINDING D-8: Missing UPDATE RLS policy on chat_messages (LOW)**
No UPDATE policy exists for `chat_messages`. Currently no route updates messages, but if message editing is added in the future, RLS would block it silently.
- **Recommendation:** Add when needed, or document the intentional omission.

**FINDING D-9: No foreign key index on chat_messages.session_id for CASCADE deletes (MEDIUM)**
When a chat session is deleted, PostgreSQL must find all related `chat_messages` to cascade the delete. The existing `idx_chat_messages_session` index covers this, so CASCADE deletes will be efficient. No action needed.

### 2.3 Scale Assessment (5K-20K Users)

| Concern | At 5K Users | At 20K Users | Mitigation |
|---|---|---|---|
| `chat_messages` table size | ~500K rows (100 msgs/user) | ~2M rows | Add created_at index, consider partitioning by date |
| `protocol_completions` size | ~1.5M rows (300 completions/user) | ~6M rows | Existing composite indexes are well-designed for this |
| Chat search (ilike) | Slow (~seconds) | Very slow (~10+ seconds) | Add trigram index or switch to full-text search |
| Dashboard aggregation queries | Acceptable | Multiple joins could slow down | Consider materialized view for weekly adherence |
| Streak calculations | OK (fetches all completions per user) | Could fetch 1000+ rows per user | Add LIMIT or date range filter on streak queries |

### 2.4 RLS Policy Completeness

| Table | SELECT | INSERT | UPDATE | DELETE | Assessment |
|---|---|---|---|---|---|
| users | own | own | own | - | Missing DELETE (acceptable -- handled by service role in account deletion) |
| survey_responses | own | own | own | - | Missing DELETE (handled by service role) |
| chat_sessions | own | own | own | own | Complete |
| chat_messages | own (via session) | own (via session) | - | **MISSING** | Needs DELETE policy (see D-7) |
| user_protocols | own | own | own | own | Complete |
| protocol_completions | own | own | - | own | Complete |
| protocol_favorites | own | own | - | own | Complete |
| protocol_notes | own | own | own | own | Complete |
| protocols | public read | - | - | - | Appropriate for reference data |
| protocol_tools | public read | - | - | - | Appropriate |
| protocol_categories | public read | - | - | - | Appropriate |

---

## 3. AI Cost Modeling

### 3.1 Chat Implementation Analysis

The chat route (`src/app/api/chat/route.ts`) uses:
- **Model:** `claude-sonnet-4-20250514` (Claude Sonnet 4)
- **Max output tokens:** 1,024
- **Streaming:** Yes (SSE)
- **RAG context:** Up to 5 Pinecone matches injected into system prompt
- **Conversation history:** Up to 20 turns (40 messages) included

### 3.2 Token Estimation per Message

| Component | Estimated Tokens |
|---|---|
| System prompt (base) | ~150 tokens |
| RAG context (5 chunks, ~300 words each) | ~2,000 tokens |
| Protocol context (when applicable, ~50% of requests) | ~200 tokens avg |
| Conversation history (avg 5 prior turns) | ~1,500 tokens |
| Current user message | ~50 tokens |
| **Total input tokens per request** | **~3,900 tokens** |
| Average assistant response (within 1,024 max) | ~400 tokens |
| **Total output tokens per request** | **~400 tokens** |

### 3.3 Cost per Message

Using Anthropic API pricing for Claude Sonnet 4:
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens

| Component | Calculation | Cost |
|---|---|---|
| Input cost | 3,900 tokens x $3.00/1M | $0.0117 |
| Output cost | 400 tokens x $15.00/1M | $0.0060 |
| Embedding (Voyage/OpenAI for RAG) | ~50 tokens x ~$0.10/1M | $0.000005 |
| **Total per message** | | **$0.0177** |

### 3.4 Cost per User per Month

Assuming 20 chat messages per active user per month:

| Metric | Value |
|---|---|
| Messages per user/month | 20 |
| Cost per message | $0.0177 |
| **Cost per user/month** | **$0.354** |

### 3.5 Total Cost Projections

| Monthly Active Users | Messages/Month | Monthly AI Cost | Annual AI Cost |
|---|---|---|---|
| 1,000 | 20,000 | $354 | $4,248 |
| 5,000 | 100,000 | $1,770 | $21,240 |
| 20,000 | 400,000 | $7,080 | $84,960 |
| 50,000 | 1,000,000 | $17,700 | $212,400 |

### 3.6 Cost Sensitivity Analysis

The 20 messages/month assumption is conservative. Power users may send 50-100 messages/month, while casual users may send 2-5. A more realistic distribution:

| User Segment | % of Users | Messages/Month | Weighted Avg |
|---|---|---|---|
| Casual (browse-only) | 40% | 3 | 1.2 |
| Regular | 40% | 15 | 6.0 |
| Power user | 15% | 50 | 7.5 |
| Heavy user | 5% | 100 | 5.0 |
| **Weighted average** | | | **19.7 msgs/user** |

This confirms the 20 messages/month estimate is reasonable.

### 3.7 Cost Drivers Ranked

1. **Output tokens (34% of cost):** Despite being fewer tokens, output costs $15/1M vs $3/1M input, making it the largest cost driver per token.
2. **RAG context injection (51% of input tokens):** The 5-chunk RAG context dominates the input token count.
3. **Conversation history (38% of input tokens):** Multi-turn history accumulates quickly. A 20-turn conversation has ~6,000 history tokens alone.
4. **max_tokens setting:** Currently 1,024 -- this constrains costs. If increased, output costs would rise proportionally.

### 3.8 Cost Optimization Recommendations

**OPT-1: Implement response caching for common questions (IMPACT: 20-40% cost reduction)**
Many health protocol questions are repetitive (e.g., "how to improve sleep", "best supplements for focus"). Cache responses for semantically similar queries using embedding similarity threshold.
- Cache hit rate estimate: 20-40% for a health advice domain
- Implementation: Redis/Upstash cache keyed by embedding vector similarity

**OPT-2: Reduce RAG context to 3 chunks (IMPACT: 15-20% cost reduction)**
Currently 5 chunks are retrieved. Analysis of relevance typically shows diminishing returns after 3 chunks. Reducing to 3 would save ~800 input tokens per request.
- Risk: Slightly less comprehensive answers
- Mitigation: Use reranking to ensure top 3 are highest quality

**OPT-3: Truncate conversation history (IMPACT: 10-25% cost reduction)**
The current limit is 20 turns (40 messages). Most conversational context is captured in the last 5-8 turns. Implement sliding-window summarization:
- Keep last 5 full turns verbatim
- Summarize older turns into a ~200 token summary
- Estimated savings: ~800 tokens for longer conversations

**OPT-4: Use Claude Haiku for simple queries (IMPACT: 60-80% cost reduction on applicable queries)**
Route simple, factual questions to Claude 3.5 Haiku ($0.25/1M input, $1.25/1M output) instead of Sonnet. Implement a query classifier that detects:
- Simple factual lookups ("what temperature for cold exposure?")
- Clarification questions ("what did you mean by...")
- Estimated 30-40% of queries could use Haiku, saving ~70% on those requests
- Net impact: ~25% overall cost reduction

**OPT-5: Implement per-user usage limits (IMPACT: caps tail risk)**
Add tiered usage limits to prevent cost blowouts from power users:
- Free tier: 30 messages/month
- Premium tier: 200 messages/month
- Enforcement: counter in database, checked before API call

**OPT-6: Reduce max_tokens for protocol-specific queries (IMPACT: 5-10% cost reduction)**
When `protocol_id` is provided, the response scope is narrower. Reduce `max_tokens` from 1,024 to 512 for protocol-context queries.

### 3.9 Optimized Cost Projection

Applying OPT-1 (30% cache hit), OPT-2 (3 chunks), and OPT-4 (Haiku routing for 35% of queries):

| MAU | Current Monthly Cost | Optimized Monthly Cost | Savings |
|---|---|---|---|
| 5,000 | $1,770 | $780 | 56% |
| 20,000 | $7,080 | $3,120 | 56% |
| 50,000 | $17,700 | $7,800 | 56% |

---

## 4. Summary of Recommendations by Priority

### P0 -- Address Before Scale (Sprint 14-15)

| ID | Category | Finding | Effort |
|---|---|---|---|
| S-1 | Security | Add rate limiting to all API routes | Medium |
| D-7 | Database | Add DELETE RLS policy on chat_messages | Small |
| D-1 | Database | Add index on chat_messages.created_at | Small |
| D-2 | Database | Add partial index on user_protocols(user_id) WHERE is_active | Small |

### P1 -- Address Before 5K Users

| ID | Category | Finding | Effort |
|---|---|---|---|
| S-2 | Security | Refactor /api/search to avoid .or() string interpolation | Medium |
| S-3 | Security | Escape LIKE wildcards in /api/chat/search | Small |
| D-4 | Database | Add trigram index or full-text search for chat messages | Medium |
| D-5 | Database | Move protocol_completions to supabase/migrations/ | Small |
| OPT-2 | Cost | Reduce RAG chunks from 5 to 3 | Small |
| OPT-5 | Cost | Implement per-user usage limits | Medium |

### P2 -- Address Before 20K Users

| ID | Category | Finding | Effort |
|---|---|---|---|
| D-6 | Database | Remove duplicate migration files | Small |
| OPT-1 | Cost | Implement semantic response caching | Large |
| OPT-3 | Cost | Sliding-window history summarization | Medium |
| OPT-4 | Cost | Query classifier for Haiku routing | Large |
| S-5 | Security | Replace SELECT * with explicit column list in profile GET | Small |
| S-4 | Security | Add Zod validation to /api/ingest | Small |

### P3 -- Nice to Have

| ID | Category | Finding | Effort |
|---|---|---|---|
| S-6 | Security | Add CSRF/Origin checking on mutations | Medium |
| S-7 | Security | Verify NODE_ENV=production on Vercel | Small |
| D-8 | Database | Add UPDATE policy on chat_messages when needed | Small |
| OPT-6 | Cost | Reduce max_tokens for protocol-scoped queries | Small |

---

*End of Architecture Review -- Sprint 14*
