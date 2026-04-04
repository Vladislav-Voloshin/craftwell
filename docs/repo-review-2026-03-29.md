# Huberman Health Adviser Repository Review -- 2026-03-29

This document complements [docs/architecture-review-sprint14.md](./architecture-review-sprint14.md).
The Sprint 14 review is broad and architecture-heavy; this one focuses on the current repository state, the active pull requests reviewed on 2026-03-29, and the most practical next improvements.

## Scope

- Local verification run:
  - `npm test` -> 15 files, 140 tests passed
  - `npm run typecheck` -> passed
  - `npm run lint` -> 1 warning in `src/lib/api/helpers.test.ts`
- GitHub PR review pass on open PRs `#72`, `#74`, `#75`, `#76`, `#77`, and `#78`
- Code review focus:
  - correctness and regressions
  - reliability and operability
  - E2E speed and flake risk
  - maintainability of the highest-churn areas

## Executive Summary

The repository is in solid shape overall: local unit tests and typecheck are green, API routes generally enforce auth consistently, and the codebase already has useful internal docs. The biggest remaining risks are not broad architectural failures; they are concentrated in a few high-leverage areas:

1. Error handling around asynchronous Supabase writes still needs more discipline in stream and cleanup paths.
2. E2E coverage breadth is good, but the suite is too slow and stateful for current CI limits.
3. Several core files are growing large enough that future changes will get riskier and slower to review.
4. Active PRs are stacked and moving quickly, so review conclusions can go stale unless they are tied to the live GitHub diff.

## Highest-Priority Suggestions

### 1. Treat Supabase writes as data-bearing results, not just thrown exceptions

**Why it matters**

Several flows rely on Supabase helpers that return `{ data, error }` even when the promise resolves successfully. That means `try/catch` or `Promise.allSettled` alone is not enough to guarantee failures are observed.

**Where this matters most**

- `src/app/api/chat/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/chat/sessions/route.ts`

**Suggested action**

- Standardize a small helper pattern for Supabase mutations:
  - await the mutation
  - inspect `error`
  - log with request context
  - choose whether to retry, degrade gracefully, or fail the request
- Add unit tests for:
  - assistant-message save failure after successful stream generation
  - session timestamp update failure
  - partial account deletion cleanup failures

### 2. Keep query-param parsing defensive everywhere

**Why it matters**

Pagination and search params are an easy place for accidental runtime failures. The safest pattern is to parse once, normalize once, and reject or default invalid values explicitly.

**Where this matters most**

- `src/app/api/chat/sessions/route.ts`
- `src/app/api/protocols/completions/route.ts`
- any future `offset` / `limit` / `tz_offset` consumers

**Suggested action**

- Add a shared parser utility for bounded numeric query params.
- Use `Number.isFinite` checks consistently instead of relying on `Math.max` / `Math.min` to sanitize bad inputs.
- Add table-driven tests for malformed query strings like:
  - `limit=foo`
  - `limit=-1`
  - `offset=NaN`
  - extremely large values

### 3. Rework account deletion into a single transactional server-side boundary

**Why it matters**

The current route is much safer than the original version, but it still spreads destructive logic across multiple sequential deletes. That increases the chance of partial cleanup and makes recovery semantics harder to reason about.

**Where this matters most**

- `src/app/api/profile/route.ts`

**Suggested action**

- Move account deletion into one database-side function or tightly scoped server helper that:
  - deletes child rows in a known order
  - returns a structured result for each phase
  - leaves a clear retry story if auth deletion fails after data deletion
- Add an integration test that simulates one failed delete in the middle of the process.

### 4. Reduce E2E flake by removing shared mutable test state

**Why it matters**

The suite uses one hard-coded test account while running multiple workers. That creates invisible coupling between tests that touch sessions, onboarding, favorites, profile state, and streak data.

**Where this matters most**

- `e2e/helpers.ts`
- `playwright.config.ts`
- `.github/workflows/e2e.yml`

**Suggested action**

- Create per-worker or per-test-user fixtures.
- Prefer API/setup seeding over repeated UI onboarding flows when the test is not specifically about onboarding.
- Reserve the shared user only for true smoke coverage if needed.

## E2E and CI Recommendations

### Current bottleneck

A recent CI run spent almost the full job budget inside Playwright execution after setup, browser install, migrations, and app startup. The current config is already doing the right thing by building once in CI and using `next start` inside Playwright; the remaining problem is overall suite runtime and shared-state drag, not a duplicate build.

### Recommended sequence

1. Split PR coverage into tiers.
   - PRs: smoke suite on the most critical flows
   - `dev` / `main` / scheduled runs: full suite

2. Introduce sharding once state isolation is fixed.
   - Splitting into 2 jobs is likely the fastest path to lower wall-clock time.

3. Always produce a durable Playwright artifact.
   - Keep HTML or blob output available even on cancelled runs.

4. Make failures easier to triage.
   - include traces on retry
   - preserve screenshots and the HTML report consistently

## Maintainability Suggestions

### 1. Break up oversized UI files

The following files are already large enough that future changes will become harder to review and regression-test:

- `src/components/profile/profile-view.tsx`
- `src/components/profile/profile-editor.tsx`
- `src/app/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`

**Suggested action**

- Extract data sections and presentational blocks into smaller leaf components.
- Keep page files focused on composition, data loading, and metadata.

### 2. Centralize environment access

The repo already has `coreEnv()` and `serverEnv()`, which is good. Some routes still read `process.env` directly.

**Suggested action**

- Standardize on env helpers for all non-trivial runtime config.
- Keep direct `process.env` reads limited to low-level env modules.

### 3. Finish the logging migration consistently

Structured logging is moving in the right direction, but a few areas still deserve cleanup:

- browser-facing error boundaries still need a clear policy on when console output is acceptable
- critical API mutation paths should consistently log request IDs and entity IDs
- noisy dev-only logs should stay on the client logger side, not drift back into server modules

## Tests to Add Next

### API

- `src/app/api/chat/route.ts`
  - newest-history-window behavior
  - assistant save failure after successful stream
  - timestamp update failure path

- `src/app/api/chat/sessions/route.ts`
  - invalid pagination params
  - `hasMore` and `total` semantics

- `src/app/api/protocols/completions/route.ts`
  - invalid pagination params
  - response compatibility when pagination is omitted

- `src/app/api/profile/route.ts`
  - partial deletion failure handling
  - repeated delete attempt behavior

### UI / E2E

- empty states with genuinely empty backend data
- static asset access without auth redirects (`/robots.txt`, `/sitemap.xml`, `/manifest.json`)
- pagination behavior for long session lists

## Smaller Cleanups Worth Doing

- Remove the unused `requireAuth` import warning in `src/lib/api/helpers.test.ts`.
- Update deprecated Sentry config options in `next.config.ts`.
- Keep `docs/architecture-review-sprint14.md` in sync with what is actually merged versus still living only on branches or PRs.

## Suggested Next Sprint Order

1. Finish the active PR fixes for chat cleanup and any remaining live PR review items.
2. Stabilize E2E state isolation and split smoke vs full coverage.
3. Refactor the largest profile and landing-page components.
4. Add targeted API tests for pagination and cleanup failure paths.
5. Revisit account deletion as a single transactional workflow.
