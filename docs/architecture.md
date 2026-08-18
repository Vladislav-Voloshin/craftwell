# Architecture Overview

## System Architecture

```
Browser
  |
  v
Next.js (Vercel Edge + Node)
  |-- Middleware (auth + session refresh)
  |-- App Router (pages + API routes)
  |
  +-- Supabase (PostgreSQL + Auth)
  |     |-- User data, chat sessions, protocols
  |     |-- Row-Level Security for multi-tenant isolation
  |
  +-- Pinecone (Vector DB)
  |     |-- Semantic search over Huberman Lab content
  |     |-- Voyage AI embeddings (1024-dim)
  |
  +-- Anthropic API (Claude)
        |-- Streaming chat responses (SSE)
        |-- Protocol extraction during ingestion
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (REST)
│   │   ├── chat/          # Chat + sessions endpoints
│   │   ├── profile/       # User profile CRUD
│   │   ├── protocols/     # Protocol management + completions
│   │   ├── search/        # Hybrid text + semantic search
│   │   └── ingest/        # Admin ingestion pipeline
│   ├── auth/              # Login/signup pages
│   ├── chat/              # Chat UI page
│   ├── onboarding/        # Health survey onboarding
│   ├── profile/           # Profile page
│   └── protocols/         # Protocol browsing + detail pages
├── components/            # React components by domain
│   ├── ui/                # Reusable UI primitives (shadcn)
│   ├── chat/              # Chat interface components
│   ├── auth/              # Auth forms
│   ├── layout/            # App shell, navigation
│   ├── profile/           # Profile editor/viewer
│   ├── protocols/         # Protocol cards, lists
│   └── onboarding/        # Onboarding wizard
├── lib/                   # Shared utilities
│   ├── api/               # API helpers (auth, validation, rate-limit, logging)
│   ├── supabase/          # Supabase client/server setup + middleware
│   ├── pinecone/          # Pinecone client + embedding helpers
│   ├── ingestion/         # Scrapers, chunkers, extractors
│   ├── types/             # TypeScript type definitions
│   ├── env.ts             # Zod environment validation
│   ├── logger.ts          # Pino structured logger
│   └── utils.ts           # General utilities (cn, etc.)
└── proxy.ts               # Edge middleware entry point
```

## Key Data Flows

### Authentication

1. User signs up/in via Supabase Auth (email/password or OAuth)
2. Edge middleware (`proxy.ts` -> `updateSession()`) refreshes session on every request
3. Unauthenticated requests to protected routes redirect to `/auth`
4. API routes use `requireAuth()` to extract the user from the session cookie
5. First-time users are redirected to `/onboarding` for the health survey

### Chat (RAG Pipeline)

1. User sends message via `POST /api/chat`
2. Server generates embedding via Voyage AI
3. Queries Pinecone for top-5 similar content chunks
4. Builds system prompt with retrieved context
5. Streams Claude response via SSE (Server-Sent Events)
6. Client renders tokens as they arrive via `useChatStream` hook
7. Both user and assistant messages are persisted in Supabase

### Protocol Tracking

1. User browses protocols at `/protocols`
2. Activates a protocol via `POST /api/protocols/user` (action: "activate")
3. Marks individual tools complete via `POST /api/protocols/completions` (toggle)
4. Streaks calculated server-side using DST-safe UTC date math

### Search

`GET /api/search?q=...` runs two searches in parallel:

1. **Text search**: Supabase `.or()` with `ilike` on protocol title/description
2. **Semantic search**: Voyage AI embedding -> Pinecone top-8 matches

Results merged and returned to the client.

### Evidence Ingestion

Admin-only (`POST /api/ingest` with bearer token):

1. **Discover**: Read official Huberman RSS metadata and date-bounded PubMed indexes.
2. **Normalize**: Assign stable identities, canonical links, topics, guests, and publication types.
3. **Provenance**: Preserve each source path while merging duplicate evidence records.
4. **Review**: Keep guest-author matches and extracted claims pending until verified.

`GET /api/cron/weekly-ingestion` runs this flow every Tuesday. Full transcripts,
articles, books, captions, and unlicensed databases are excluded. See
`docs/evidence-ingestion.md`.

## Database Schema

### User Domain

- `users` -- Profile data (extends Supabase auth.users)
- `survey_responses` -- Onboarding health survey (1:1 with users)

### Chat Domain

- `chat_sessions` -- Conversation containers
- `chat_messages` -- Individual messages (user/assistant)

### Protocol Domain

- `protocol_categories` -- 10 health categories (seeded)
- `protocols` -- Health protocols with effectiveness ranking
- `protocol_tools` -- Actionable steps within a protocol
- `user_protocols` -- User's adopted protocols (active/inactive)
- `protocol_completions` -- Daily tool completion tracking

### Evidence Domain

- `evidence_documents` -- Canonical source metadata and short permitted excerpts
- `document_sources` -- Per-source identifiers and provenance
- `people`, `document_people`, `person_sources` -- Guest/author identity graph
- `ingestion_sources`, `ingestion_runs` -- Rights policy, checkpoints, and observability
- `evidence_claims`, `protocol_evidence` -- Review-gated claims and protocol links

Legacy `podcast_episodes`, `newsletters`, and `content_chunks` remain for
compatibility; unsupported raw-content scrapers fail closed.

### RLS Policy Summary

| Table                                        | Policy                               |
| -------------------------------------------- | ------------------------------------ |
| User data (users, survey, chats)             | User can only access own rows        |
| Protocol data (protocols, categories, tools) | Public read, no write via client     |
| Content data (chunks, episodes, newsletters) | Service-role only (no client access) |

## API Routes

| Method | Path                         | Auth  | Description                         |
| ------ | ---------------------------- | ----- | ----------------------------------- |
| POST   | `/api/chat`                  | Yes   | Send chat message (SSE stream)      |
| GET    | `/api/chat/sessions`         | Yes   | List sessions or load messages      |
| GET    | `/api/search?q=`             | Yes   | Hybrid text + semantic search       |
| GET    | `/api/profile`               | Yes   | Get user profile + survey           |
| PUT    | `/api/profile`               | Yes   | Update profile/survey               |
| GET    | `/api/protocols/user`        | Yes   | List user's protocols               |
| POST   | `/api/protocols/user`        | Yes   | Activate/deactivate/remove protocol |
| GET    | `/api/protocols/completions` | Yes   | Today's completions or streaks      |
| POST   | `/api/protocols/completions` | Yes   | Toggle tool completion              |
| POST   | `/api/ingest`                | Admin | Run ingestion pipeline steps        |

## Error Handling

All API routes use a consistent pattern:

1. `requireAuth()` throws `AuthError` if no session -> 401
2. `parseBody(request, zodSchema)` validates input -> 400 on failure
3. `handleApiError(err, requestId)` catches everything else -> 500
4. Errors are logged via pino with request IDs for correlation

## Testing

- **Unit tests** (Vitest): `src/**/*.test.ts` -- pure logic (chunker, env, utils, route matching)
- **E2E tests** (Playwright): `e2e/` -- full browser flows (auth, chat, protocols, profile)
- Run with: `npm test` (unit) / `npm run test:e2e` (e2e)
