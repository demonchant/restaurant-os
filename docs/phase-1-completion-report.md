# Phase 1 completion report

Date: 2026-08-17  
Security verdict: **PASS WITH ACCEPTED LOW-RISK FINDINGS**

## Implemented

- Country-aware E.164 customer phone normalization and tenant-associated customer identities.
- Cryptographic, hashed, expiring, attempt-limited, resend-limited, single-use SMS/WhatsApp OTP challenges.
- Provider-neutral delivery interface plus a fixed-URL, timeout-bound, timestamp/HMAC-signed webhook adapter.
- Staff email/password authentication with Argon2id, uniform failures, layered Redis limits, and dummy-hash comparison.
- Encrypted TOTP factor storage, MFA challenges, privileged assurance level, and shorter privileged sessions.
- Opaque server sessions, secure cookies, CSRF binding, expiration, status enforcement, individual/global revocation, visibility, and activity tracking.
- Verified customer phone changes, session revocation, staff password recovery, and single-use invitation/recovery token foundation.
- Strict versioned API endpoints and real customer/staff browser authentication flows.
- Authentication audit/security events, secret redaction inheritance, migration/runtime privilege updates, CI configuration, tests, and documentation.

No menu, ordering, pricing, inventory, kitchen, delivery, payment, discount, welfare, AI, or other later-phase business feature was added.

## Architecture and database

`packages/auth` owns phone/password/OTP/TOTP/encryption primitives. `services/api/src/auth` owns application contracts, services, adapters, database repositories, and routes. React owns only user interaction and validated API calls. Core identity code does not depend on an SMS/WhatsApp vendor.

Migration `0001_identity.sql` adds identity kinds and verification/password/MFA attributes to users; CSRF/auth method/assurance/device metadata to sessions; and OTP challenge, identity token, MFA factor, and MFA challenge tables. Composite user/tenant foreign keys preserve tenant ownership. Runtime delete privilege is removed from identity state.

API details are in [authentication.md](./api/authentication.md), design in [identity.md](./architecture/identity.md), and controls in [authentication.md](./security/authentication.md).

## Verification

Source regression coverage includes authentication primitives, service workflows, the Fastify HTTP/cookie boundary, one-time tokens, Phase 0 API/security behavior, and frontend API validation. PostgreSQL tests cover tenant constraints, active-session resolution, atomic OTP consumption, and runtime privileges when `TEST_DATABASE_URL` is available. The full repository command is:

```powershell
pnpm check
pnpm audit --audit-level high
```

For Docker-backed verification, start Docker then run:

```powershell
docker compose up -d postgres redis
pnpm db:migrate
$env:TEST_DATABASE_URL='postgresql://restaurant_os:test-only@localhost:5432/restaurant_os_test'
pnpm --filter @restaurant-os/api test
docker compose build api web
```

CI supplies PostgreSQL/Redis, creates the restricted runtime role, migrates, and runs lint, strict typecheck, all tests, builds, dependency audit, Gitleaks, and CodeQL.

## Deployment and rollback

Supply independent high-entropy session/OTP/webhook secrets and a 32-byte base64 MFA key through the deployment secret manager. Set an HTTPS public API origin, exact CORS origins, secure-cookie domain only when required, and the signed delivery webhook. Apply migration before deploying the new API. Smoke-test `/ready`, OTP delivery, customer verification, staff login/MFA, logout, and revocation.

Application rollback is safe while the additive schema remains. Database down-migration is intentionally not automated because dropping identity tables destroys credentials/security evidence. If rollback is required, redeploy the prior application, preserve the additive schema, revoke newly issued sessions, and investigate before any reviewed archival/schema-removal migration.

## Known limitations and Phase 2 dependencies

Provider-specific messaging, privileged enrollment/recovery ceremonies, and staff invitation acceptance are deployment/Phase 2 work described in the accepted findings. Phase 2 must use the existing identity-token primitive, require authorized staff administration, enforce MFA policy for owner/admin activation, attach roles/permissions server-side, audit every lifecycle change, and add cross-tenant/privilege-escalation tests. It must not add a second session, password, OTP, or invitation system.
