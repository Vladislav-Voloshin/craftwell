# Craftwell

AI-powered health protocol recommendations based on Huberman Lab research. Browse evidence-based protocols, track daily completions, and chat with an AI assistant grounded in peer-reviewed sources.

**Production:** https://craftwell.vercel.app
**Preview (dev):** Deployed automatically from the `dev` branch via Vercel

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API routes, Claude API (Anthropic)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Search:** Pinecone (vector), Voyage AI (embeddings)
- **Testing:** Playwright (E2E), ESLint, Prettier
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A Supabase project
- API keys for: Anthropic, Pinecone, Voyage AI

### 1. Clone and install

```bash
git clone https://github.com/Vladislav-Voloshin/craftwell-health-adviser.git
cd craftwell-health-adviser
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

See [Environment Variables](#environment-variables) for details on each key.

### 3. Run database migrations

Open the [Supabase SQL Editor](https://supabase.com/dashboard) and run:

```bash
# Initial schema
supabase/migrations/001_initial_schema.sql

# Completions table
scripts/create-completions-table.sql

# Profile fields
scripts/migrations/001-add-profile-fields.sql

# RLS policies
scripts/fix-onboarding-rls.sql
```

### 4. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000.

### 5. Seed the knowledge base

Trigger the ingestion pipeline to populate protocols and embeddings:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"step":"full-pipeline"}'
```

## Environment Variables

Create a `.env.local` file with the following:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for chat and protocol extraction |
| `ANTHROPIC_MODEL` | No | Claude model ID (default: `claude-sonnet-4-20250514`) |
| `PINECONE_API_KEY` | Yes | Pinecone vector database key |
| `PINECONE_INDEX` | Yes | Pinecone index name (default: `craftwell`) |
| `VOYAGE_API_KEY` | Yes | Voyage AI key for text embeddings |
| `YOUTUBE_API_KEY` | No | YouTube Data API key (for podcast scraping) |
| `ADMIN_API_KEY` | No | Protects the `/api/ingest` endpoint |
| `LOG_LEVEL` | No | Pino log level (default: `info` in production, `debug` in dev) |
| `NEXT_PUBLIC_APP_URL` | No | App URL (default: `http://localhost:3000`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checker |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Run E2E tests with UI |

## Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── api/          # REST endpoints (chat, search, protocols, profile, ingest)
│   ├── auth/         # Authentication page
│   ├── chat/         # AI chat interface
│   ├── onboarding/   # Health survey wizard
│   ├── profile/      # User profile and streaks
│   └── protocols/    # Protocol browsing and detail pages
├── components/       # React components (chat, layout, protocols, profile, ui)
└── lib/              # Shared utilities
    ├── ingestion/    # Content scrapers and embedding pipeline
    ├── pinecone/     # Vector search client and embeddings
    └── supabase/     # Supabase client, server, and middleware
e2e/                  # Playwright E2E test suites
```

## Dev Environment

This project uses a two-branch workflow:

- **`dev`** -- Integration branch. All feature and bugfix branches merge here first. Pushes to `dev` trigger a Vercel preview deployment for testing.
- **`main`** -- Production branch. When `dev` is stable, it is merged into `main`, which triggers the production deployment at craftwell.vercel.app.

To start working on a new feature:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-feature
# ... make changes ...
git push -u origin feature/my-feature
# Open a PR targeting dev
```

## Health Monitoring

An admin health dashboard is available at `/admin/health`. It displays the real-time status of all external services (Supabase, Pinecone, Anthropic) with latency measurements and auto-refreshes every 30 seconds.

The underlying API endpoint (`GET /api/health`) is public and returns JSON with per-service status checks. It responds with HTTP 200 when all services are healthy and 503 when any service is degraded or unreachable.

## Automated PR Review

This repo includes a GitHub Actions workflow at `.github/workflows/codex-pr-review.yml` that runs an automatic Codex review whenever a pull request is opened, reopened, marked ready for review, or updated. It also sends a Telegram message that the PR is waiting for your approval.

Setup:

1. Add repository secrets named `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`.
2. Push the workflow to the default branch.
3. Open or update a pull request to trigger the review bot and Telegram alert.

Notes:

- The workflow uses the official `openai/codex-action`.
- Reviews are posted as a single upserted PR comment so updates do not spam the thread.
- The workflow uses `pull_request_target` so reviews and Telegram alerts can run for forked PRs too.
- To reduce risk, it checks out the PR merge ref, avoids persistent checkout credentials, and runs Codex in a read-only sandbox.
