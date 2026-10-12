# Phase 2 completion report

Date: 2026-08-17  
Security verdict: **PASS WITH ACCEPTED LOW-RISK FINDINGS**

## Implemented

- Tenant-owned system roles: OWNER, ADMIN, MANAGER, FOH, KITCHEN, PACKING, DELIVERY.
- Central granular permission registry, explicit least-privilege role mappings, rank/context policy, and location-scoping foundation.
- Server-side staff listing, invitation/acceptance/revocation, privileged TOTP activation, profile/scope update, suspension/reactivation, role changes, and session visibility/revocation.
- Current database permission resolution on every session use; sensitive changes revoke sessions.
- First-owner bootstrap with safe same-recipient pending-invitation reissue, database-enforced last-active-owner invariant, and ordinary OWNER assignment denial.
- Real `/staff`, invitation acceptance, and MFA enrollment interfaces backed by versioned APIs.
- Tenant/rank/location constraints, strict schemas, CSRF, layered invitation limits, signed delivery adapter, audit/security events, concurrency controls, tests, CI inheritance, and documentation.

No menu, food, pricing, ordering, payment, inventory, delivery operation, kitchen, printing, discount, welfare, referral, refund, or AI business functionality was introduced.

## Database and architecture

Migration `0002_authorization.sql` adds role rank/metadata, assigner attribution, staff profiles, location access, TOTP enrollment expiry, system-role provisioning for existing/new tenants, last-owner guards, permission seeds/mappings, and restricted runtime grants. Composite tenant foreign keys prevent cross-tenant staff/location/role associations.

The central engine lives in `packages/authorization`; `services/api/src/staff` owns application policy, persistence, delivery adapter, and routes. UI code consumes validated responses but is not an authorization boundary. Details are in `docs/architecture/authorization.md`, `docs/security/rbac.md`, `docs/api/staff.md`, and `docs/operations/staff-administration.md`.

## Verification

- Lint: passed across all workspaces.
- Strict typecheck: passed across all workspaces.
- Source/API tests: 58 API tests passed; 10 PostgreSQL-dependent tests skipped because the local Docker daemon is stopped. Other workspace tests passed.
- Production builds: all TypeScript services/packages and the Next.js application passed; `/staff` and identity routes prerender successfully.
- Dependency audit: no known vulnerabilities reported at the configured HIGH threshold.
- Secret checks: repository pattern scan found no private-key or live-token signatures; Gitleaks remains an unchanged required CI job because its binary is not installed locally.
- Docker Compose configuration: valid. Docker engine execution remains the documented environment gap.
- Adversarial review: one HIGH invitation-revocation policy gap was found, fixed, and regression-tested; no unresolved CRITICAL/HIGH remains.

When Docker is running, formal environment verification is:

```powershell
docker compose up -d postgres redis
pnpm db:migrate
$env:TEST_DATABASE_URL='postgresql://restaurant_os:test-only@localhost:5432/restaurant_os_test'
pnpm --filter @restaurant-os/api test
docker compose build api web
```

CI must continue to run migrations, restricted-role assertions, integration/concurrency tests, lint, strict typecheck, builds, dependency audit, Gitleaks, and CodeQL.

## Deployment and rollback

Configure the independent identity-token pepper, MFA encryption key, exact application/API origins, Redis/PostgreSQL, and signed invitation-delivery webhook. Apply migration before the API, verify system roles and runtime grants, then bootstrap the first owner and complete MFA. Smoke-test invitation, activation, authorization denial, role/status session revocation, and audit visibility.

The migration is additive. Application rollback should redeploy the previous compatible application while retaining the schema and security evidence. Do not auto-drop staff/role/audit state. If schema removal becomes necessary, use a separately reviewed archival migration after revoking new sessions and preserving audit records.

## Known limitations and Phase 3 dependencies

Accepted risks are explicit in `docs/security/phase-2-security-review.md`. Phase 3 must implement tenant-owned restaurant/location/device lifecycle, make location assignment operationally usable, preserve composite tenant boundaries, and add device/location resource authorization. It must not replace the principal, session, permission registry, invitation, or staff lifecycle systems. Owner transfer, custom roles, break-glass access, and future permission grants remain unavailable until independently designed and reviewed.
