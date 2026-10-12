# Phase 2 final security acceptance review

Date: 2026-08-17

Scope: permission registry, tenant roles, staff profiles/location scope, current-session authorization resolution, owner invariants/bootstrap, invitations, staff lifecycle/session administration, API/UI, migration/runtime grants, concurrency, audit/security events, and adversarial tests.

## Executive result

Review identified and remediated the findings below. No unresolved CRITICAL or HIGH finding remains.

| Severity | Component | Exploit scenario | Remediation and regression evidence |
|---|---|---|---|
| HIGH | Invitation revocation | A lower-ranked staff administrator who obtained a privileged pending invitation ID could revoke it because the initial path checked `staff:create` but not target rank/scope. | Revocation now resolves the invitation owner and applies the same tenant, location, self, and rank policy as every staff mutation. A regression test proves MANAGER cannot revoke ADMIN invitation while OWNER can. |
| HIGH | Authorization freshness | Authorization embedded in session claims could preserve a removed role until expiry. | Session resolution joins current active account, roles, permissions, and location assignments on every request; mutation also revokes sessions. A PostgreSQL regression removes a role and verifies the same session immediately loses its permission. |
| HIGH | Last-owner availability | Concurrent removal/suspension could leave a tenant without active ownership. | Transaction-scoped tenant advisory locking and database triggers reject deletion or suspension of the last active OWNER. Database regression covers both paths. |
| MEDIUM | Privileged invitation activation | An invited ADMIN could become active with only a password. | ADMIN/OWNER acceptance creates an encrypted, expiring TOTP enrollment and leaves status pending until verification. Invalid and successful enrollment paths are tested. |
| MEDIUM | Cross-scope administration | Location-scoped management could enumerate or mutate staff outside assigned locations. | Central scope policy filters lists, returns safe absence for reads, and denies mutation/invitation scope expansion. Negative service coverage verifies both behavior classes. |
| MEDIUM | Registry tampering | Runtime credentials could alter role ranks or permission mappings outside audited services. | Runtime grants allow registry reads but revoke insert/update/delete on permissions, roles, and role-permission mappings. Registry mutation has no API. |
| MEDIUM | Concurrent role/status change | Simultaneous operations could duplicate roles, preserve sessions, or produce an unsafe active authorization state. | User row locks, unique constraints, idempotent assignment, transaction-bound session revocation, and concurrent service tests produce deterministic assignments and a suspended final identity. |
| MEDIUM | Owner bootstrap recovery | A delivered but expired first-owner invitation could leave an OWNER assignment that blocked all later bootstrap attempts. | Bootstrap may securely reissue only the sole pending owner's invitation when the normalized configured email matches; old tokens are revoked. Active, mismatched, or multiple owner assignments still fail closed. |

## Adversarial coverage

Tests exercise self escalation, OWNER injection, equal-rank management, direct endpoint calls, submitted tenant/permission fields, cross-tenant IDOR, location escape, stale session privileges, invitation replay/theft boundary, lower-rank invitation revocation, session reuse after role/status change, invalid MFA, delivery failure, duplicate concurrent assignment, and simultaneous invitation consumption. Strict schemas reject unexpected/prototype-polluting input; SQL remains parameterized.

Audit records contain actor, tenant, target/resource, request ID, and previous/new role or status metadata. Invitation/password/session/TOTP values are excluded. Authorization failures use the security-event path. AI, menu, pricing, payment, inventory, and local-agent functionality remain absent.

## Accepted low-risk findings and mandatory gates

| Severity | Finding | Acceptance and next gate |
|---|---|---|
| LOW | Full location lifecycle and assignment UX are not part of Phase 2. | Enforcement, storage, constraints, and API scope updates exist. Phase 3 must supply tenant-owned location administration and UI without weakening this boundary. |
| LOW | General OWNER transfer/recovery is intentionally unavailable. | Bootstrap is one-time and last-owner invariants prevent lockout through ordinary administration. A future transfer ceremony must require strong reauthentication, dual confirmation/recovery policy, session revocation, and audit review before exposure. |
| LOW | Invitation delivery remains provider-neutral. | The real fixed-URL HMAC adapter fails closed. Production provider certification, delivery receipts, secret rotation, and mailbox-risk review are deployment gates. |
| LOW | PostgreSQL row-level security remains unevaluated. | Composite tenant constraints, server-derived tenant context, query filters, and negative tests protect current data. Re-evaluate before tenant business tables begin in Phase 4; do not let this become indefinite debt. |
| INFORMATIONAL | Local Docker daemon is stopped. | Source tests and production builds pass; ten PostgreSQL/Docker tests are skipped locally and remain CI-required. Phase 2 formal environment sign-off requires the existing Docker workflow, not weakened tests. |

## Final verdict

PASS WITH ACCEPTED LOW-RISK FINDINGS
