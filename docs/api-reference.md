# Craftwell API Reference

All API routes live under `/api/` and follow Next.js App Router conventions. Unless stated otherwise, authenticated endpoints use Supabase session cookies (set automatically by the frontend). Unauthenticated requests receive a `401` response.

Responses are JSON unless noted. Error responses follow the shape:

```json
{
  "error": "Description of what went wrong"
}
```

---

## Table of Contents

- [Health](#health)
- [Auth](#auth)
- [Chat](#chat)
- [Search](#search)
- [Protocols -- User Protocols](#protocols----user-protocols)
- [Protocols -- Completions](#protocols----completions)
- [Protocols -- Streaks](#protocols----streaks)
- [Protocols -- Favorites](#protocols----favorites)
- [Protocols -- Notes](#protocols----notes)
- [Protocols -- Dashboard](#protocols----dashboard)
- [Protocols -- Export](#protocols----export)
- [Profile](#profile)
- [Profile -- Achievements](#profile----achievements)
- [Ingest (Admin)](#ingest-admin)

---

## Health

### `GET /api/health`

Public health check endpoint that reports the connectivity status of all external services.

| Field | Details |
|-------|---------|
| **Auth required** | No |
| **Cache** | `no-store` (always fresh) |

**Response (200 when healthy, 503 when degraded/unhealthy):**

```json
{
  "status": "healthy",
  "uptime": 3600,
  "version": "0.1.0",
  "checks": {
    "supabase": { "status": "healthy", "latencyMs": 42 },
    "pinecone": { "status": "healthy", "latencyMs": 110 },
    "anthropic": { "status": "healthy" }
  },
  "timestamp": "2026-03-29T10:00:00Z"
}
```

Each service check returns a `status` of `"healthy"`, `"degraded"`, or `"unhealthy"`, with an optional `latencyMs` (for services that are actively probed) and `error` (when unhealthy). The overall `status` is `"healthy"` only when all individual checks are healthy; otherwise it is `"degraded"`.

- **Supabase** is checked with a lightweight `SELECT id FROM protocols LIMIT 1` query.
- **Pinecone** is checked by calling `describeIndexStats()` on the configured index.
- **Anthropic** is verified by checking that the `ANTHROPIC_API_KEY` environment variable is set (no API call is made to avoid cost).

The `/admin/health` page consumes this endpoint and auto-refreshes every 30 seconds.

---

## Auth

### `GET /api/auth/callback`

Handles OAuth callback after a user authenticates with an external provider (e.g., Google).

| Field | Details |
|-------|---------|
| **Auth required** | No (this is part of the auth flow itself) |
| **Query params** | `code` -- OAuth authorization code |
| | `error` / `error_description` -- Provider error (optional) |
| | `next` -- Redirect path after login (default: `/onboarding`) |
| **Response** | `302 Redirect` to `/protocols` (if onboarding complete), `/onboarding` (new user), or `/auth?error=...` (on failure) |

**Example:**

```
GET /api/auth/callback?code=abc123
-> 302 Redirect to /onboarding
```

---

## Chat

### `POST /api/chat`

Send a message to the AI health adviser and receive a streamed response.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |
| **Rate limited** | Yes |
| **Content-Type** | `application/json` |

**Request body:**

```json
{
  "message": "What supplements help with sleep?",
  "session_id": "uuid (optional -- omit to create a new session)",
  "protocol_id": "uuid (optional -- provides protocol context to the AI)"
}
```

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `message` | string | Yes | 1--4000 characters |
| `session_id` | string (UUID) | No | Existing session to continue |
| `protocol_id` | string (UUID) | No | Protocol to ask about |

**Response:** Server-Sent Events (SSE) stream with `Content-Type: text/event-stream`.

Each event is a JSON line prefixed with `data: `:

```
data: {"type":"meta","session_id":"...","sources":[...]}
data: {"type":"text","text":"Based on research..."}
data: {"type":"text","text":" melatonin at 0.5-1mg..."}
data: {"type":"done"}
```

Event types:
- `meta` -- Session ID and source references (sent first)
- `text` -- Incremental text chunks of the AI response
- `error` -- Error message if generation fails
- `done` -- Stream complete

**Implementation notes:**
- The Claude model is configured via the `ANTHROPIC_MODEL` environment variable (defaults to `claude-sonnet-4-20250514`).
- Chat history is loaded with a single joined query (session + messages) to avoid N+1 query patterns.
- When Pinecone is unreachable, the route degrades gracefully by skipping RAG context rather than returning an error.

---

### `GET /api/chat/sessions`

List all chat sessions or load messages for a specific session. Supports pagination via `offset` and `limit` query parameters.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**List all sessions (paginated):**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `offset` | number | No | 0 | Number of sessions to skip |
| `limit` | number | No | 20 | Maximum sessions to return |

```
GET /api/chat/sessions
GET /api/chat/sessions?offset=0&limit=10
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "title": "What supplements help with sleep?",
      "protocol_id": "uuid | null",
      "created_at": "2026-03-28T10:00:00Z",
      "updated_at": "2026-03-28T10:05:00Z"
    }
  ]
}
```

**Load messages for a session:**

```
GET /api/chat/sessions?session_id=<uuid>
```

**Response:**

```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What supplements help with sleep?",
      "sources": null,
      "created_at": "2026-03-28T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Based on research, here are the top supplements...",
      "sources": [{"type": "podcast", "title": "...", "chunk_id": "..."}],
      "created_at": "2026-03-28T10:00:05Z"
    }
  ]
}
```

---

### `PATCH /api/chat/sessions`

Rename a chat session.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "session_id": "uuid",
  "title": "Sleep supplements advice"
}
```

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `session_id` | string (UUID) | Yes | Must belong to the authenticated user |
| `title` | string | Yes | 1--200 characters |

**Response:**

```json
{
  "status": "renamed",
  "title": "Sleep supplements advice"
}
```

---

### `DELETE /api/chat/sessions`

Delete a chat session and all its messages.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required |
|-----------|------|----------|
| `id` | string (UUID) | Yes |

**Example:**

```
DELETE /api/chat/sessions?id=<uuid>
```

**Response:**

```json
{
  "status": "deleted"
}
```

---

### `GET /api/chat/search`

Search across all chat messages in the authenticated user's sessions.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `q` | string | Yes | Minimum 2 characters |

**Example:**

```
GET /api/chat/search?q=melatonin
```

**Response:**

```json
{
  "results": [
    {
      "message_id": "uuid",
      "session_id": "uuid",
      "session_title": "Sleep supplements advice",
      "role": "assistant",
      "snippet": "...research suggests melatonin at 0.5-1mg taken 30...",
      "created_at": "2026-03-28T10:00:05Z"
    }
  ]
}
```

Returns up to 20 results, sorted by most recent first.

---

## Search

### `GET /api/search`

Combined protocol text search and semantic knowledge base search.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `q` | string | Yes | Minimum 2 characters |

**Example:**

```
GET /api/search?q=cold+exposure
```

**Response:**

```json
{
  "protocols": [
    {
      "id": "uuid",
      "title": "Deliberate Cold Exposure",
      "slug": "deliberate-cold-exposure",
      "category": "Temperature",
      "description": "...",
      "effectiveness_rank": 1,
      "difficulty": "Intermediate"
    }
  ],
  "knowledge": [
    {
      "score": 0.89,
      "source_type": "podcast",
      "source_title": "Episode on Cold Exposure Benefits",
      "content": "First 300 characters of matched content..."
    }
  ]
}
```

- `protocols` -- Up to 10 results from text search on protocol titles and descriptions, sorted by effectiveness rank.
- `knowledge` -- Up to 8 results from semantic (vector) search of the knowledge base with relevance scores.

---

## Protocols -- User Protocols

### `GET /api/protocols/user`

Get all protocols the authenticated user has added to their stack.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Response:**

```json
{
  "protocols": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "protocol_id": "uuid",
      "is_active": true,
      "protocols": {
        "id": "uuid",
        "title": "Morning Sunlight",
        "slug": "morning-sunlight",
        "category": "Light",
        "description": "...",
        "difficulty": "Beginner",
        "time_commitment": "10 min"
      }
    }
  ]
}
```

---

### `POST /api/protocols/user`

Activate, deactivate, or remove a protocol from the user's stack.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "protocol_id": "uuid",
  "action": "activate | deactivate | remove"
}
```

| Parameter | Type | Required | Values |
|-----------|------|----------|--------|
| `protocol_id` | string (UUID) | Yes | |
| `action` | string | Yes | `activate`, `deactivate`, `remove` |

**Response:**

```json
{
  "status": "activated"
}
```

- `activate` -- Adds the protocol (or re-activates if previously deactivated). Uses upsert.
- `deactivate` -- Sets `is_active` to false. Keeps the record and history.
- `remove` -- Deletes the user-protocol link entirely.

---

## Protocols -- Completions

### `GET /api/protocols/completions`

Get today's completed tools for a specific protocol. Supports pagination via `offset` and `limit` query parameters.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `protocol_id` | string (UUID) | Yes | | |
| `type` | string | No | | Set to `"streaks"` for streak data instead |
| `tz_offset` | number | No | | Client timezone offset in minutes (for accurate "today") |
| `offset` | number | No | 0 | Number of records to skip |
| `limit` | number | No | 50 | Maximum records to return |

**Default response (today's completions):**

```
GET /api/protocols/completions?protocol_id=<uuid>&tz_offset=-300
```

```json
{
  "completed_tool_ids": ["uuid1", "uuid2"],
  "date": "2026-03-28"
}
```

**Streak response:**

```
GET /api/protocols/completions?protocol_id=<uuid>&type=streaks&tz_offset=-300
```

```json
{
  "streak": 5,
  "longest_streak": 12,
  "total_days": 30
}
```

---

### `POST /api/protocols/completions`

Toggle a tool completion for today. If the tool is not yet completed today, it marks it complete. If it is already completed, it un-completes it (toggle behavior).

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "protocol_id": "uuid",
  "tool_id": "uuid",
  "tz_offset": -300
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `protocol_id` | string (UUID) | Yes | |
| `tool_id` | string (UUID) | Yes | |
| `tz_offset` | number | No | Timezone offset in minutes (-720 to 720) |

**Response (completed):**

```json
{
  "status": "completed"
}
```

**Response (uncompleted / toggled off):**

```json
{
  "status": "uncompleted"
}
```

---

## Protocols -- Streaks

### `GET /api/protocols/streaks`

Get streak information for all active protocols at once.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required |
|-----------|------|----------|
| `tz_offset` | number | No |

**Response:**

```json
{
  "protocols": [
    {
      "protocol_id": "uuid",
      "title": "Morning Sunlight",
      "slug": "morning-sunlight",
      "current_streak": 5,
      "longest_streak": 12,
      "total_days": 30
    }
  ],
  "best_current": 5,
  "best_longest": 12
}
```

- `current_streak` -- Consecutive fully-completed days ending today or yesterday
- `longest_streak` -- All-time best consecutive run
- `total_days` -- Total number of fully-completed days
- `best_current` / `best_longest` -- Highest values across all active protocols

---

## Protocols -- Favorites

### `GET /api/protocols/favorites`

Get the list of protocol IDs the user has favorited.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Response:**

```json
{
  "protocol_ids": ["uuid1", "uuid2"]
}
```

---

### `POST /api/protocols/favorites`

Toggle a protocol favorite. Adds if not favorited, removes if already favorited.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "protocol_id": "uuid"
}
```

**Response (added):**

```json
{
  "favorited": true
}
```

**Response (removed):**

```json
{
  "favorited": false
}
```

---

## Protocols -- Notes

### `GET /api/protocols/notes`

Get the user's note for a protocol.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required |
|-----------|------|----------|
| `protocol_id` | string (UUID) | Yes |

**Response:**

```json
{
  "note": {
    "id": "uuid",
    "content": "I noticed better sleep after adding this...",
    "updated_at": "2026-03-28T10:00:00Z"
  }
}
```

Returns `{"note": null}` if no note exists.

---

### `PUT /api/protocols/notes`

Create or update a note for a protocol.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "protocol_id": "uuid",
  "content": "Week 2: I noticed better focus in the morning..."
}
```

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `protocol_id` | string (UUID) | Yes | |
| `content` | string | Yes | Max 5000 characters |

**Response:**

```json
{
  "note": {
    "id": "uuid",
    "content": "Week 2: I noticed better focus in the morning...",
    "updated_at": "2026-03-28T10:00:00Z"
  }
}
```

---

### `DELETE /api/protocols/notes`

Delete a note for a protocol.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required |
|-----------|------|----------|
| `protocol_id` | string (UUID) | Yes |

**Response:**

```json
{
  "ok": true
}
```

---

## Protocols -- Dashboard

### `GET /api/protocols/dashboard`

Get weekly adherence data for all active protocols.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Query params:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `week` | string (YYYY-MM-DD) | No | Monday of the target week. Defaults to current week |
| `tz_offset` | number | No | Timezone offset in minutes |

**Example:**

```
GET /api/protocols/dashboard?week=2026-03-23&tz_offset=-300
```

**Response:**

```json
{
  "week_start": "2026-03-23",
  "week_end": "2026-03-29",
  "dates": ["2026-03-23", "2026-03-24", "...", "2026-03-29"],
  "protocols": [
    {
      "protocol_id": "uuid",
      "title": "Morning Sunlight",
      "slug": "morning-sunlight",
      "total_tools": 3,
      "daily": [
        {"date": "2026-03-23", "completed": 3, "total": 3, "percentage": 100},
        {"date": "2026-03-24", "completed": 1, "total": 3, "percentage": 33},
        {"date": "2026-03-25", "completed": 0, "total": 3, "percentage": 0}
      ]
    }
  ],
  "overall_adherence": 42
}
```

---

## Protocols -- Export

### `GET /api/protocols/export`

Export all completion history as a CSV file.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |
| **Response Content-Type** | `text/csv` |

**Response headers:**

```
Content-Type: text/csv
Content-Disposition: attachment; filename="craftwell-progress-2026-03-28.csv"
```

**CSV format:**

```
Date,Protocol,Tool,Completed
2026-03-28,Morning Sunlight,Get outside within 30 min of waking,Yes
2026-03-28,Morning Sunlight,Face sunlight for 10 min,Yes
2026-03-27,Cold Exposure,2-min cold shower,Yes
```

---

## Profile

### `GET /api/profile`

Get the authenticated user's profile and survey responses.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Response:**

```json
{
  "profile": {
    "id": "uuid",
    "display_name": "Vlad",
    "first_name": "Vladyslav",
    "last_name": "Voloshyn",
    "age": 30,
    "email": "vlad@example.com",
    "onboarding_completed": true
  },
  "survey": {
    "user_id": "uuid",
    "health_goals": ["sleep", "focus", "energy"],
    "sleep_quality": 6,
    "exercise_frequency": "3-4 times/week",
    "stress_level": 5,
    "supplement_experience": "some",
    "focus_areas": ["morning routine", "sleep optimization"]
  }
}
```

---

### `PUT /api/profile`

Update profile fields and/or survey responses. Only include the fields you want to change.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Request body:**

```json
{
  "profile": {
    "display_name": "Vlad V.",
    "first_name": "Vladyslav",
    "last_name": "Voloshyn",
    "age": 30
  },
  "survey": {
    "health_goals": ["sleep", "focus"],
    "sleep_quality": 7,
    "exercise_frequency": "5+ times/week",
    "stress_level": 4,
    "supplement_experience": "experienced",
    "focus_areas": ["cold exposure"]
  }
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `profile.display_name` | string | Max 100 chars |
| `profile.first_name` | string | Max 50 chars |
| `profile.last_name` | string | Max 50 chars |
| `profile.age` | number | 1--150 |
| `survey.health_goals` | string[] | |
| `survey.sleep_quality` | number | 1--10 |
| `survey.exercise_frequency` | string | |
| `survey.stress_level` | number | 1--10 |
| `survey.supplement_experience` | string | |
| `survey.focus_areas` | string[] | |

**Response:**

```json
{
  "status": "ok",
  "profile": "updated",
  "survey": "updated"
}
```

---

### `DELETE /api/profile`

Permanently delete the authenticated user's account and all associated data.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

Deletes in order:
1. Auth user (via service-role admin client)
2. Protocol completions
3. User protocols
4. Chat messages (across all sessions)
5. Chat sessions
6. Survey responses
7. User profile row

**Response:**

```json
{
  "status": "deleted"
}
```

---

## Profile -- Achievements

### `GET /api/profile/achievements`

Get the user's achievement progress.

| Field | Details |
|-------|---------|
| **Auth required** | Yes |

**Response:**

```json
{
  "achievements": [
    {
      "id": "first-protocol",
      "title": "Getting Started",
      "description": "Add your first protocol",
      "icon": "Sprout",
      "unlocked": true,
      "progress": {"current": 1, "target": 1}
    },
    {
      "id": "streak-7",
      "title": "Unstoppable",
      "description": "Achieve a 7-day streak",
      "icon": "Zap",
      "unlocked": false,
      "progress": {"current": 3, "target": 7}
    }
  ],
  "unlocked": 4,
  "total": 12
}
```

There are 12 achievements in total. See the [User Help Guide](./user-help-guide.md#achievements) for the full list.

---

## Ingest (Admin)

### `POST /api/ingest`

Run content ingestion pipeline steps. This is an admin-only endpoint protected by API key, not user authentication.

| Field | Details |
|-------|---------|
| **Auth required** | No (uses `Authorization: Bearer <ADMIN_API_KEY>` header) |

**Request body:**

```json
{
  "step": "full-pipeline"
}
```

| Step | Description |
|------|-------------|
| `scrape-podcasts` | Scrape podcast episode metadata |
| `scrape-newsletters` | Scrape newsletter content |
| `chunk-podcasts` | Chunk podcast transcripts for embedding |
| `chunk-newsletters` | Chunk newsletter content for embedding |
| `embed` | Run the full embedding pipeline (generate vectors and upsert to Pinecone) |
| `extract-protocols` | Extract structured protocols from content using AI |
| `full-pipeline` | Run all steps in sequence |

**Example:**

```bash
curl -X POST https://craftwell.vercel.app/api/ingest \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"step": "scrape-podcasts"}'
```

**Response (single step):**

```json
{
  "success": true,
  "totalChunks": 142
}
```

**Response (full-pipeline):**

```json
{
  "success": true,
  "podcasts": { "...": "..." },
  "newsletters": { "...": "..." },
  "chunks": { "podcasts": 142, "newsletters": 87 },
  "embeddings": { "...": "..." },
  "protocols": 24
}
```
