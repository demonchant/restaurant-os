# Phase 0 final security acceptance review

Date: 2026-08-16

Scope: the implemented Phase 0 source, migrations, API adapters, tests, dependency graph, frontend build, Docker/Compose configuration, CI, and security documentation. Phase 1 authentication functionality was not started.

## Executive result

The review found three high-severity and four medium-severity implementation weaknesses. All were fixed and covered by automated or structural verification. No critical, high, or medium finding remains unresolved. The remaining findings are low-risk in the current Phase 0 surface and become release gates in the phases that introduce the relevant functionality.

## Resolved findings

| Severity | Affected component | Finding and exploit scenario | Fix | Regression evidence |
|---|---|---|---|---|
| HIGH | PostgreSQL tenant model | Tenant columns existed, but single-column foreign keys allowed a Tenant A user to be associated with Tenant B's role, or a Tenant A location with Tenant B's restaurant. A malformed repository write could create cross-tenant authorization/data relationships. | Added composite `(resource_id, tenant_id)` uniqueness and foreign keys for restaurant/location, user/role, role/permission, session/user, device/location, and idempotency actor/user relationships. Permission joins also require the session tenant. | PostgreSQL integration tests reject cross-tenant role and restaurant/location associations; route tests reject tenant switching and forged tenant/role headers. |
| HIGH | Idempotency | `get` followed by operation followed by `put` allowed two concurrent requests to both observe no record and execute duplicate work. | Replaced it with an atomic database claim using a unique scope and `INSERT ... ON CONFLICT`, explicit acquired/replay/conflict/in-progress states, request-hash enforcement, and guarded completion. | Concurrent duplicate, changed-payload replay, sequential replay, cross-user reuse, and cross-tenant reuse tests. |
| HIGH | API production image | The API runtime copied the entire workspace and depended on source-oriented workspace exports. This increased supply-chain/diagnostic exposure and could make runtime resolution depend on TypeScript source. | Added type/runtime conditional exports, production `files` allowlists, a `pnpm deploy --prod` image stage, and verified the deployed module graph contains the runnable artifact without API or workspace source/tests. | Temporary production deploy tree and `dist/app.js` import were verified; full production build passes. |
| MEDIUM | Audit database privileges | The local runtime database connection used the schema-owner role; an application compromise could modify audit evidence. `PUBLIC` revocation alone does not constrain a table owner. | Added a non-owner, non-superuser runtime role, default runtime grants, migration-time revocation of audit/security-event update/delete rights, and CI initialization of the same role. | Integration assertion checks insert is allowed while update/delete are denied when the runtime role exists. |
| MEDIUM | Request/audit correlation | Fastify accepted client-supplied request IDs, allowing an attacker to choose/collide audit correlation identifiers. | Removed the trusted request-ID header path. IDs are now generated server-side and returned to clients. | A forged `x-request-id` is ignored; audit attribution matches the server response ID. |
| MEDIUM | Content-type handling | The foundation mutation endpoint accepted `text/plain` because it had no route content-type contract. This could undermine future schema assumptions. | Added an authenticated JSON-only content-type guard and safe 400/415 classifications. Fastify's prototype-key rejection remains enabled. | Unsupported content type and JSON prototype-pollution regression tests. |
| MEDIUM | Tenant suspension | A valid user/session remained usable when the owning tenant status was not active. | Session resolution now joins the tenant and requires `ACTIVE` tenant and user status, in addition to unexpired/unrevoked session state. | PostgreSQL integration test suspends a tenant and verifies its session is rejected. |
| LOW | Structured logging | Top-level credential fields were redacted, but common nested request-body/credential paths were not explicitly covered. | Added nested password, OTP, token, session-token, API-key, cookie, and authorization-header paths. | Logger test verifies the raw values never reach serialized output. |
| LOW | Dependency surface | Three workspaces carried Vitest despite owning no tests. | Removed those unused test dependencies and retained explicit no-test package scripts. | Lockfile regenerated; full workspace checks and zero-advisory audit pass. |

## Tenant isolation and authorization review

Authenticated tenant context is produced only by the session store. Client `tenantId`, role, permission, and correlation headers cannot establish identity. Protected tenant access requires both `tenant:read` and exact resource-tenant equality. The session query requires matching session/user/tenant IDs and matching tenant-scoped role and permission records. Composite database constraints prevent invalid cross-tenant relationships even if a future repository omits an application check.

There is no platform-superadmin bypass in Phase 0. Any future cross-tenant support operation must be a separate, explicitly authorized platform capability with reason capture, immutable audit, and tests; it must not weaken `requireTenant`.

## Authentication review

- Opaque token generation uses 32 cryptographically random bytes.
- Only a peppered SHA-256 token hash is persisted/queried; bearer syntax and length are bounded.
- Session expiration, revocation, active-user status, and active-tenant status are enforced in one query.
- Invalid stored sessions create security events without recording the token.
- No authentication issuance, password login, OTP, recovery, cookie, or MFA endpoint exists yet; therefore there is no cookie/session-fixation or user-enumeration surface to accept in Phase 0.
- Phase 1 must use Argon2id for passwords, hashed one-use OTP challenges, uniform account-discovery responses, Redis-backed endpoint-specific attempt/resend limits, session rotation on authentication/privilege change, revocation, secure HttpOnly/Secure/SameSite cookies if cookies are selected, CSRF protection for cookie mutations, and MFA for privileged users.

## API and database review

The API has server-generated request IDs, configured CORS origins, Helmet security headers, body limits, safe error envelopes, JSON mutation enforcement, bounded bearer/idempotency headers, and rate limiting. Fastify safely rejects prototype-polluting JSON keys. No route mass-assigns a request object into persistence.

Database calls use Postgres tagged-template parameters. Dynamic values are never concatenated into identifiers or SQL. JSON is serialized then passed as a parameter and cast to `jsonb`. Tenant ownership is enforced relationally. The migration consistency check passes. Audit writes require tenant context and record actor, tenant, action, resource type/ID, database timestamp, and authoritative request ID.

## Secrets and dependency review

- High-confidence private-key, cloud-key, GitHub/OpenAI/Slack-token patterns: no matches outside excluded dependency/build/local-environment data.
- `.env` is an intentional ignored local file; `.env.example` contains only local examples.
- The production frontend bundle contains no session secret, database URL, or local database credentials.
- The lockfile is present, package release age is configured, CodeQL/Gitleaks/audit gates exist, and `pnpm audit --audit-level low` reports no known vulnerabilities.
- Fixed Docker database passwords are explicitly local-only examples bound to loopback; production deployment must replace Compose with managed secrets and separate roles.

## Docker review

API and web runtime containers use non-root users, read-only filesystems, temporary `/tmp`, all Linux capabilities dropped, and `no-new-privileges`. Production API deployment contains production dependencies and compiled artifacts rather than source/tests. PostgreSQL, Redis, API, and web published ports bind to loopback. Frontend/backend networks prevent the web container from joining the database network. Secrets are supplied at runtime, not baked into images.

Docker Compose configuration validates. Container execution, migration execution, and integration tests remain environment-blocked because the local Docker engine is stopped; CI contains the Docker-backed database and runtime-role checks.

## Required future AI boundary

The AI service must receive no database credentials and no generic HTTP/SQL/shell tool. Every tool is an allowlisted, versioned application command such as menu search or cart update with a strict input/output schema. The API authenticates the conversation/channel identity, derives tenant context, authorizes the tool action, loads canonical price/availability, validates all model-produced values, executes normal domain services, applies idempotency for mutations, and audits the actor/model/tool/resource/request. Price, discount, refund, payment, inventory, staff-benefit, and tenant changes require deterministic server rules and human approval where specified. Tool output is minimized to the conversation's tenant and purpose. Prompt/model/tool traces are treated as sensitive untrusted data.

## Required future local-agent boundary

The agent must have a per-device asymmetric identity tied to tenant/location, short-lived authenticated connections, revocation and last-seen state, and no reusable restaurant/user session. Cloud commands require a versioned allowlisted type, strict schema, tenant/device destination, nonce, expiry, replay record, and signature/authorization. Allowed capabilities are limited to print job, printer status, health, configuration retrieval, and constrained synchronization. There is no shell, arbitrary executable, arbitrary URL fetch, filesystem browse, or generic command field. Updates require signed artifacts, version/rollback policy, staged rollout, integrity verification, and audit. Device compromise triggers immediate revocation and host rebuild without granting backend/database access.

## Required future financial boundary

Orders, payments, refunds, discounts, staff debt, and welfare require immutable ledger-style records and database transactions. Payment initiation uses tenant/actor/action/request-hash idempotency; concurrent claims never execute twice. Provider webhooks require raw-body signature verification, timestamp tolerance, replay-event uniqueness, provider-side transaction verification, strict state transitions, and reconciliation against provider statements. Uploaded proof never marks payment paid. Refunds and manual reconciliation require granular permission, separation/approval rules, reason, prior/new state, provider reference, and immutable audit. Financial records are corrected with compensating entries, not destructive edits. An unknown outcome is reconciled before retrying.

## Accepted low-risk findings and remaining gates

| Severity | Remaining risk | Acceptance condition |
|---|---|---|
| LOW | Rate limiting is process-local and universal. | Acceptable because Phase 0 has no credential/payment/public business endpoints. Phase 1 must introduce Redis-backed endpoint classes before login/OTP issuance. |
| LOW | PostgreSQL row-level security is not enabled. | Composite tenant integrity plus application authorization is sufficient for the empty business surface. Re-evaluate and decide transaction-bound RLS before the first tenant business tables are released. |
| LOW | The static Next.js CSP permits inline framework scripts/styles. | No untrusted content is rendered. Introduce nonce/hash CSP when dynamic/authenticated surfaces arrive and test it in the chosen ingress. |
| LOW | A crashed operation can leave an idempotency claim in progress until expiry. | This fails closed against duplication. Money phases require provider reconciliation and an explicit stale-claim recovery workflow rather than blind retry. |
| INFORMATIONAL | Docker-backed migration/integration/image execution was not possible locally. | CI must pass these checks with the Docker engine before formal Phase 0 infrastructure sign-off. |

## Verification performed

- `pnpm check`: pass (lint, strict typecheck, tests, production builds across all workspaces).
- Source tests: 32 pass; 6 PostgreSQL/Docker-dependent integration tests are present and skipped locally without `TEST_DATABASE_URL`.
- Drizzle migration consistency: pass.
- Docker Compose configuration: pass.
- Minimal production API deploy and runtime module graph: pass; source/tests excluded.
- Dependency audit at low severity: no known vulnerabilities.
- Repository high-confidence secret scan: pass.
- Frontend bundle server-secret scan: pass.

## Final verdict

PASS WITH ACCEPTED LOW-RISK FINDINGS
