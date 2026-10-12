# Developer setup

1. Install Node 22+, pnpm 10.15, Docker, and Git.
2. Copy `.env.example` to `.env` and replace example secret/password values.
3. Run `docker compose up -d postgres redis`.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm db:migrate`.
6. Run `pnpm dev`.

Use `pnpm db:generate` after an intentional schema change and review generated SQL. Never edit a production database manually. Test configuration uses a separate database; integration tests refuse URLs without `test` in the database URL.

Windows PowerShell execution policy may block `pnpm.ps1`; use `pnpm.cmd` without weakening the machine-wide execution policy.
