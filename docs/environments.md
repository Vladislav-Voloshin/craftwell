# Environments & Project Structure

## Environments

| Environment | Branch | URL | Deploys On | Purpose |
|-------------|--------|-----|-----------|---------|
| **Production** | `main` | https://craftwell.vercel.app | Sprint-end merge from `dev` | Live user-facing app |
| **Dev/Staging** | `dev` | Vercel Preview URL (auto-generated) | Every push to `dev` | Testing before production. QA validates here. |
| **PR Preview** | `feature/*`, `bugfix/*` | Vercel skips (ignoreCommand) | N/A | PRs don't get Vercel deploys to avoid rate limits |
| **Local** | Any | http://localhost:3000 | `npm run dev` | Developer workstation |

### Vercel Configuration

`vercel.json` controls which branches trigger deploys:
- `main` and `dev` branches: deploy (exit code 1 from ignoreCommand)
- All other branches: skip (exit code 0)

### Environment Variables

| Variable | Required | Where | Description |
|----------|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | All | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server | Supabase admin key (account deletion, admin ops) |
| `ANTHROPIC_API_KEY` | Yes | Server | Claude API key for AI chat |
| `ANTHROPIC_MODEL` | No | Server | Model override (default: `claude-sonnet-4-20250514`) |
| `PINECONE_API_KEY` | Yes | Server | Pinecone vector DB key |
| `PINECONE_INDEX` | Yes | Server | Pinecone index name (`huberman-health`) |
| `VOYAGE_API_KEY` | Yes | Server | Voyage AI embedding key |
| `YOUTUBE_API_KEY` | No | Server | YouTube data API (ingestion only) |
| `ADMIN_API_KEY` | Yes | Server | Auth for `/api/ingest` admin endpoint |
| `NEXT_PUBLIC_APP_URL` | No | Client | App base URL (default: auto-detected) |
| `SENTRY_ORG` | No | Build | Sentry organization slug |
| `SENTRY_PROJECT` | No | Build | Sentry project slug |
| `LOG_LEVEL` | No | Server | Pino log level (default: `info`) |
| `SUPABASE_ACCESS_TOKEN` | No | CI | Supabase CLI token for migrations |

---

## Project Structure

```
huberman-health-adviser/
├── .github/
│   └── workflows/
│       ├── e2e.yml                    # E2E tests (smoke on PRs, full on push)
│       └── codex-pr-review.yml        # Automated PR review via OpenAI Codex
├── docs/
│   ├── api-reference.md               # All API endpoints documented
│   ├── architecture-review-sprint14.md # Architecture decisions and reviews
│   ├── environments.md                # This file
│   ├── faq.md                         # Frequently asked questions
│   ├── production-checklist.md        # Pre-deploy verification checklist
│   ├── repo-review-2026-03-29.md      # Full codebase audit findings
│   ├── setup.md                       # Developer setup guide
│   ├── user-guide.md                  # End-user manual
│   └── user-help-guide.md            # In-app help content
├── e2e/                               # Playwright E2E tests (23 files)
│   ├── 01-07-*.spec.ts               # Smoke tests (run on PRs)
│   ├── 08-23-*.spec.ts               # Full suite (run on push)
│   └── helpers.ts                     # Test utilities and auth helpers
├── public/                            # Static assets
│   └── manifest.json                  # PWA manifest
├── scripts/
│   └── migrations/                    # Manual SQL migrations
├── src/
│   ├── app/                           # Next.js App Router pages
│   │   ├── page.tsx                   # Landing page (public)
│   │   ├── layout.tsx                 # Root layout with fonts, theme, SEO
│   │   ├── auth/                      # Authentication (email, phone, Google)
│   │   ├── chat/                      # AI chat interface
│   │   ├── protocols/                 # Protocol browsing and detail
│   │   │   ├── [slug]/               # Dynamic protocol pages
│   │   │   └── dashboard/            # Weekly progress dashboard
│   │   ├── profile/                   # User profile and achievements
│   │   ├── onboarding/               # 4-step health survey
│   │   ├── admin/health/             # Health monitoring dashboard (auth required)
│   │   ├── privacy/                   # Privacy policy (public)
│   │   ├── terms/                     # Terms of service (public)
│   │   ├── api/                       # API routes
│   │   │   ├── chat/                 # Chat + sessions CRUD
│   │   │   ├── health/               # Service health check (public)
│   │   │   ├── ingest/               # Content ingestion (admin)
│   │   │   ├── profile/              # User profile CRUD + delete
│   │   │   ├── protocols/            # Completions, favorites, streaks, dashboard
│   │   │   └── search/               # Hybrid text + semantic search
│   │   ├── robots.ts                  # robots.txt generation
│   │   └── sitemap.ts                 # Dynamic sitemap with protocol URLs
│   ├── components/
│   │   ├── auth/                      # Auth forms, social login, useAuth hook
│   │   ├── chat/                      # Chat interface, sidebar, messages, streaming
│   │   ├── layout/                    # App shell with bottom nav
│   │   ├── onboarding/               # Survey step components
│   │   ├── profile/                   # Profile view, editor, achievements
│   │   ├── protocols/                 # Protocol list, detail, tools, streaks
│   │   ├── pwa/                       # Service worker registration
│   │   ├── seo/                       # JSON-LD structured data
│   │   ├── tour/                      # Onboarding tour overlay
│   │   └── ui/                        # shadcn/ui base components
│   └── lib/
│       ├── api/                       # API helpers, rate limiting, request IDs
│       ├── ingestion/                 # Content scraping and processing pipeline
│       ├── pinecone/                  # Vector DB client and embeddings
│       ├── supabase/                  # DB client, middleware, route matching
│       ├── client-logger.ts           # Client-side logger (silent in prod)
│       ├── logger.ts                  # Server-side pino logger
│       ├── env.ts                     # Environment variable validation
│       ├── types/                     # TypeScript type definitions
│       └── utils.ts                   # Shared utilities (cn, toggleItem)
├── supabase/
│   └── migrations/                    # Database migrations (run via CI)
├── next.config.ts                     # Next.js config (CSP, CORS, Sentry)
├── playwright.config.ts              # E2E config (smoke/full projects)
├── vercel.json                        # Deploy rules (main + dev only)
├── vitest.config.ts                   # Unit test config
└── package.json                       # Dependencies and scripts
```

---

## Git Branching Flow

```
main (production)     ←── sprint-end merge from dev (after QA sign-off)
  │
dev (staging)         ←── all PRs merge here
  │
  ├── feature/xyz     ←── feature branches (from dev)
  ├── bugfix/abc      ←── bugfix branches (from dev)
  └── ...
```

### Rules
1. All branches created FROM `dev`
2. All PRs target `dev` (never `main` directly)
3. PRs are NEVER draft — always ready for review
4. Codex automated review runs on every PR push
5. E2E smoke tests (7 files) run on PRs, full suite (23 files) on push to dev/main
6. At sprint end: QA tests dev preview, signs off, then dev merges to main
7. Vercel deploys production on merge to main

---

## CI/CD Pipeline

### On PR to dev:
1. Lint (`npm run lint`)
2. Type check (`npx tsc --noEmit`)
3. Build (`npm run build`)
4. E2E smoke tests (7 critical test files)
5. Codex automated code review
6. Vercel preview deploy skipped (rate limit protection)

### On push to dev:
1. Same as PR checks but full E2E suite (23 files)
2. Vercel preview deploy

### On push to main:
1. Full E2E suite
2. Vercel production deploy

---

## Third-Party Services

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| **Supabase** | Auth, PostgreSQL database, RLS | supabase.com/dashboard/project/xoybijzmusbzpgzfvppu |
| **Vercel** | Hosting, edge functions, CDN | vercel.com |
| **Anthropic** | Claude AI for chat | console.anthropic.com |
| **Pinecone** | Vector database for RAG search | app.pinecone.io |
| **Voyage AI** | Text embeddings | dash.voyageai.com |
| **Sentry** | Error monitoring | sentry.io |
| **GitHub Actions** | CI/CD pipeline | github.com/.../actions |

---

## Monitoring

| Endpoint | URL | Auth | Purpose |
|----------|-----|------|---------|
| `/api/health` | Public | No | Service connectivity check (Supabase, Pinecone, Anthropic) |
| `/admin/health` | Auth required | Yes | Real-time health dashboard with latency charts |
| Sentry | External | Yes | Error tracking and alerts |
