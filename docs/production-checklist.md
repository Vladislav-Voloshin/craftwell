# Production Readiness Checklist

## Environment Variables

### Required (public)

| Variable                        | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (e.g. `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key                           |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry DSN for error tracking (client + server + edge)  |

### Required (server-only / secrets)

| Variable                    | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access -- never expose client-side) |
| `ANTHROPIC_API_KEY`         | Anthropic API key for AI chat                                        |
| `PINECONE_API_KEY`          | Pinecone API key for vector search                                   |
| `PINECONE_INDEX`            | Pinecone index name (defaults to `craftwell`)                        |
| `VOYAGE_API_KEY`            | Voyage AI API key for embeddings                                     |
| `ADMIN_API_KEY`             | Strong bearer secret for manual ingestion                            |
| `CRON_SECRET`               | Random 32+ character secret for Vercel cron authentication           |
| `SENTRY_ORG`                | Sentry organization slug (build-time, for source map upload)         |
| `SENTRY_PROJECT`            | Sentry project slug (build-time, for source map upload)              |

### Optional

| Variable                     | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `LOG_LEVEL`                  | Pino log level (defaults to `info` in production, `debug` in dev) |
| `ANALYZE`                    | Set to `true` to enable bundle analyzer                           |
| `NCBI_CONTACT_EMAIL`         | Operator contact for NCBI E-utilities (recommended)               |
| `NCBI_API_KEY`               | Optional higher NCBI request allowance                            |
| `CROSSREF_CONTACT_EMAIL`     | Operator contact for the Crossref polite pool (recommended)       |
| `OPEN_LIBRARY_CONTACT_EMAIL` | Operator contact for Open Library requests (recommended)          |

---

## Supabase Setup

- [ ] Create Supabase project and note the project URL and keys
- [ ] Run all migrations: `npx supabase db push --linked`
- [ ] Verify Row-Level Security (RLS) is enabled on all user-facing tables
- [ ] Configure auth providers in Supabase Dashboard > Authentication > Providers:
  - Email/password (enabled by default)
  - Google OAuth (client ID + secret)
  - Phone OTP (Twilio credentials)
- [ ] Set auth redirect URLs to include production domain (`https://<domain>/auth/callback`)
- [ ] Verify database indexes exist for slug lookups and user queries
- [ ] Verify evidence tables are server-only and Supabase security advisors are clean

---

## Vercel Deployment

- [ ] Connect GitHub repo to Vercel project
- [ ] `vercel.json` is configured with `ignoreCommand` so only production (`main` branch) triggers deploys -- preview deploys on PRs are skipped to stay within free-tier limits
- [ ] Add all required environment variables in Vercel > Settings > Environment Variables
- [ ] Set `SENTRY_ORG` and `SENTRY_PROJECT` as build-time env vars
- [ ] Confirm production branch is set to `main`
- [ ] Confirm the weekly evidence cron is visible and sends `CRON_SECRET`
- [ ] Run one authenticated manual ingestion and inspect `ingestion_runs`
- [ ] Enable Vercel Analytics (optional, for Web Vitals)

---

## Custom Domain

- [ ] Purchase or configure domain
- [ ] Add domain in Vercel > Settings > Domains
- [ ] Set DNS records (CNAME or A record as instructed by Vercel)
- [ ] Wait for SSL certificate provisioning (automatic)
- [ ] Update Supabase auth redirect URLs to use the custom domain
- [ ] Update CSP `connect-src` in `next.config.ts` if new API domains are added

---

## Monitoring (Sentry)

Sentry is integrated across all runtimes:

- **Client**: `sentry.client.config.ts`
- **Server**: `sentry.server.config.ts`
- **Edge**: `sentry.edge.config.ts`

Checklist:

- [ ] Verify `NEXT_PUBLIC_SENTRY_DSN` is set in production
- [ ] Verify `SENTRY_ORG` and `SENTRY_PROJECT` are set for source map uploads
- [ ] Source maps upload automatically via `@sentry/nextjs` webpack plugin during build
- [ ] `automaticVercelMonitors: true` is enabled for Vercel cron/function monitoring
- [ ] Set up Sentry alerts for error rate spikes and new issue notifications
- [ ] Configure Sentry release tracking (ties deploys to error reports)

---

## Security Headers

The following headers are configured in `next.config.ts` and apply to all routes:

- `X-Frame-Options: DENY` -- prevents clickjacking
- `X-Content-Type-Options: nosniff` -- prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` -- disables camera, microphone, geolocation
- `Strict-Transport-Security` -- HSTS with 2-year max-age + preload
- `Content-Security-Policy` -- restricts scripts, styles, connections, frames
- `poweredByHeader: false` -- removes `X-Powered-By` header

---

## Secrets Rotation Schedule

| Secret                          | Rotation Frequency             | Notes                                 |
| ------------------------------- | ------------------------------ | ------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`     | On suspected compromise        | Regenerate in Supabase Dashboard      |
| `ANTHROPIC_API_KEY`             | Every 90 days or on compromise | Rotate in Anthropic Console           |
| `PINECONE_API_KEY`              | Every 90 days or on compromise | Rotate in Pinecone Console            |
| `VOYAGE_API_KEY`                | Every 90 days or on compromise | Rotate in Voyage AI Dashboard         |
| `ADMIN_API_KEY`                 | Every 90 days or on compromise | Update all admin clients              |
| `CRON_SECRET`                   | Every 90 days or on compromise | Vercel uses it for scheduled requests |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | On suspected compromise        | Public key, but regenerate if abused  |

After rotation:

1. Update the secret in Vercel environment variables
2. Trigger a redeployment
3. Verify the app functions correctly post-deploy

---

## Performance Targets

| Metric                         | Target              | Tool                          |
| ------------------------------ | ------------------- | ----------------------------- |
| Largest Contentful Paint (LCP) | < 2.5s              | Vercel Analytics / Lighthouse |
| First Input Delay (FID)        | < 100ms             | Vercel Analytics / Lighthouse |
| Cumulative Layout Shift (CLS)  | < 0.1               | Vercel Analytics / Lighthouse |
| Time to First Byte (TTFB)      | < 800ms             | Vercel Analytics              |
| Lighthouse Performance Score   | > 90                | Lighthouse CI                 |
| Bundle size (JS, gzipped)      | < 150 KB first load | `ANALYZE=true npm run build`  |
| API response time (chat)       | < 3s to first token | Sentry performance monitoring |
| Error rate                     | < 0.1% of requests  | Sentry                        |
| Uptime                         | 99.9%               | Vercel / external monitor     |
