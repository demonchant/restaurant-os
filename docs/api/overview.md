# API overview

Responses use `{ "data": ..., "requestId": "..." }` or `{ "error": { "code": "...", "message": "...", "details": [] }, "requestId": "..." }`. Production responses do not expose stacks, SQL, paths, secrets, or dependency details.

Implemented foundation endpoints:

- `GET /health`: process liveness; no dependency details.
- `GET /ready`: required PostgreSQL and Redis readiness.
- `GET /api/v1/session/me`: bearer-session introspection.
- `GET /api/v1/tenants/:tenantId`: protected tenant-boundary proof.
- `POST /api/v1/foundation/idempotent-check`: authenticated idempotency contract proof; requires a 16–128 character `Idempotency-Key`.

The last two are foundation diagnostics, not restaurant business features. Production authentication endpoints are documented in [authentication.md](./authentication.md). Unsafe requests are not automatically retried unless the operation contract guarantees idempotency.
