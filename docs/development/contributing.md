# Contributing

Work from a reviewed change, add the smallest coherent module, and keep domain rules out of UI/routes. New routes require runtime schemas, authentication decision, permission and tenant checks, safe errors, audit/security-event decisions, rate-limit class, and tests for abuse paths.

Before review run `pnpm check`, `pnpm test:security`, and `pnpm audit:dependencies`. Commit the lockfile. Do not suppress a security check without a documented, time-bounded exception and owner. Schema changes require forward SQL, deployment sequencing, rollback/forward-fix notes, and tenant-isolation review.

Never include production/customer data in fixtures, logs, screenshots, issues, or pull requests.
