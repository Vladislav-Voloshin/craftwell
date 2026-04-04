# Contributing to Craftwell

Thanks for your interest in contributing to Craftwell!

## Development Setup

```bash
git clone https://github.com/Vladislav-Voloshin/huberman-health-adviser.git
cd huberman-health-adviser
npm install
cp .env.example .env.local  # Fill in your keys
npm run dev
```

See [docs/setup.md](docs/setup.md) for detailed environment variable setup.

## Branching Strategy

```
main (production)  <-- sprint-end merge from dev (after QA sign-off)
dev (staging)      <-- all PRs merge here
  feature/xyz      <-- feature branches (from dev)
  bugfix/abc       <-- bugfix branches (from dev)
```

1. Create your branch from `dev`: `git checkout -b feature/my-feature dev`
2. Make your changes with small, descriptive commits
3. Open a PR targeting `dev` (never `main` directly)
4. PRs should be ready for review (not draft)

## Code Standards

- **TypeScript** strict mode enabled
- **ESLint** + **Prettier** for formatting (`npm run lint`)
- **Vitest** for unit tests (`npm test`)
- **Playwright** for E2E tests (`npm run test:e2e`)

Run checks before pushing:

```bash
npm run lint
npm run typecheck
npm test
```

## PR Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Link to the relevant Notion task or backlog item
- All CI checks must pass (lint, typecheck, E2E)

## Testing

- Unit tests live next to source files: `foo.ts` / `foo.test.ts`
- E2E tests live in `e2e/` directory
- New features should include both unit and E2E tests
- Target: 60%+ coverage on critical paths

## Architecture

See [docs/environments.md](docs/environments.md) for project structure and [docs/api-reference.md](docs/api-reference.md) for API documentation.
