# Deployment and rollback

CI must pass lockfile installation, migration against an isolated database, lint, strict typecheck, tests, build, high-severity dependency audit, Gitleaks, and CodeQL. Build immutable images, scan them, sign/identify the digest, deploy migrations with a dedicated migration role, then roll out API/worker/web using readiness gates.

Supply configuration from a managed secret service; do not bake it into images. Runtime containers are non-root. Use TLS at the ingress, authenticated private networks for PostgreSQL/Redis, separate database roles, centralized immutable logs, alerting, and resource limits.

Identity deployment additionally requires independent `SESSION_SECRET` and `OTP_PEPPER` values, a base64-encoded 32-byte `MFA_ENCRYPTION_KEY`, the signed OTP delivery webhook URL/secret, exact `CORS_ORIGINS`, and a browser-visible `NEXT_PUBLIC_API_URL`. The web CSP permits connections only to that configured API origin. Production cookies require HTTPS. Validate SMS/WhatsApp delivery and revocation in staging before enabling accounts.

Rollback application images to the last verified digest. Database rollback is normally a reviewed forward-fix because destructive down migrations risk data loss. For expand/contract schema work: deploy additive schema, deploy compatible code, migrate data, verify, and only later remove obsolete columns. If a migration fails before code rollout, stop and restore/forward-fix according to the reviewed migration runbook. Never improvise on production data.
