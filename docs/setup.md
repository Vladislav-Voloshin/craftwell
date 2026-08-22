# Developer Setup Guide

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project (free tier works)
- API keys for: Anthropic, Pinecone, Voyage AI

## Quick Start

```bash
# Clone and install
git clone https://github.com/Vladislav-Voloshin/craftwell-health-adviser.git
cd craftwell-health-adviser
npm install

# Set up environment
cp .env.example .env.local   # then fill in your keys (see below)

# Run database migrations
# In the Supabase dashboard SQL editor, run:
#   supabase/migrations/001_initial_schema.sql
#   supabase/migrations/002_restrict_content_rls.sql

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` with the following:

### Required (Core)

| Variable                        | Description               |
| ------------------------------- | ------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key  |

### Required (AI/Backend Routes)

| Variable                    | Description                                |
| --------------------------- | ------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only)    |
| `ANTHROPIC_API_KEY`         | Anthropic API key for Claude               |
| `PINECONE_API_KEY`          | Pinecone vector database key               |
| `PINECONE_INDEX`            | Pinecone index name (default: `craftwell`) |
| `VOYAGE_API_KEY`            | Voyage AI key for embeddings               |

### Optional

| Variable                     | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `YOUTUBE_API_KEY`            | Enables official YouTube metadata and caption-availability ingestion   |
| `ADMIN_API_KEY`              | Bearer token for `/api/ingest` admin routes                            |
| `CRON_SECRET`                | Random secret of at least 16 characters for Vercel cron authentication |
| `NCBI_CONTACT_EMAIL`         | Operator email sent to NCBI E-utilities (recommended)                  |
| `NCBI_API_KEY`               | Optional NCBI API key for a higher request limit                       |
| `CROSSREF_CONTACT_EMAIL`     | Operator email for the Crossref polite pool (recommended)              |
| `OPEN_LIBRARY_CONTACT_EMAIL` | Operator email for identified Open Library requests (recommended)      |
| `NEXT_PUBLIC_APP_URL`        | App URL (default: `http://localhost:3000`)                             |
| `LOG_LEVEL`                  | Pino log level (default: `debug` in dev, `info` in prod)               |

Environment variables are validated at runtime by route-scoped Zod schemas in `src/lib/env.ts`:

- `coreEnv()` -- safe to call from any page (Supabase keys only)
- `supabaseAdminEnv()` -- service-role database operations
- `serverEnv()` -- AI and vector routes
- `ingestionEnv()` -- manual ingestion and source credentials
- `cronEnv()` -- scheduled-job authentication

## Available Scripts

```bash
npm run dev          # Start dev server (with Turbopack)
npm run build        # Production build
npm run start        # Run production server
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check only)
npm run typecheck    # TypeScript check (tsc --noEmit)
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run test:e2e     # Playwright end-to-end tests
npm run test:e2e:ui  # Playwright with interactive UI
```

## Database Setup

The app uses Supabase (PostgreSQL) with Row-Level Security. Apply every file in
`supabase/migrations/` in timestamp order. For a linked project, use
`npx supabase db push --linked`; CI uses the same migration history.

The migrations create the application schema, seed protocol categories, apply
RLS, and add the server-only evidence registry.

## Evidence Ingestion

To populate the provenance registry, use the admin ingestion API:

```bash
# Incremental evidence refresh
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"step": "weekly-evidence"}'

# Backfills are documented in docs/evidence-ingestion.md.
```

Raw transcript, abstract, newsletter, book, YouTube-description, and Examine
copying is not supported. Claims and protocol links require review before they
become user-facing evidence.

## Deployment

The app is deployed to Vercel. Push to `main` triggers automatic deployment.

- Production URL: https://craftwell.vercel.app
- Set all environment variables in the Vercel dashboard
- Supabase connection works out of the box (no extra config needed)
