# Restaurant OS

Production foundation and Phase 1 identity system for the Pinchichi Restaurant Operating System. It deliberately contains no menu, ordering, payment, or other restaurant business behavior yet.

## Stack

- pnpm/Turborepo monorepo with strict TypeScript
- Next.js customer and staff authentication flows
- Fastify versioned API and Redis-connected worker foundation
- PostgreSQL with Drizzle schema/migrations
- Vitest, ESLint, Docker Compose, GitHub Actions, CodeQL, Gitleaks, and dependency auditing

## Local setup

Prerequisites: Node 22+, pnpm 10.15, and Docker with Compose.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Replace every `change-me`/`replace-with` value in `.env`; values are local examples only. API: `http://localhost:3001`; web: `http://localhost:3000`.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:security
pnpm build
pnpm audit:dependencies
docker compose config
```

Set `TEST_DATABASE_URL` to a migrated database whose name contains `test` to enable PostgreSQL integration tests. See [developer setup](docs/development/setup.md), [identity architecture](docs/architecture/identity.md), and the [Phase 1 report](docs/phase-1-completion-report.md).
