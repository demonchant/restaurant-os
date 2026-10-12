# Phase 1 final security acceptance review

Date: 2026-08-17

Scope: implemented customer/staff authentication, OTP and delivery boundaries, passwords, MFA, sessions/cookies/CSRF, recovery, phone change, one-time invitation primitives, database migration, frontend API client and authentication screens, tests, configuration, CI, and documentation.

## Executive result

Adversarial review found and remediated the findings below. Regression coverage includes concurrent credential consumption and the real Fastify HTTP boundary. No critical, high, or medium finding remains unresolved.

| Severity | Component | Exploit scenario | Remediation and evidence |
|---|---|---|---|
| HIGH | OTP and identity tokens | Read-then-write consumption could allow two concurrent requests to authenticate or accept an invitation with one credential. | PostgreSQL consumption is one conditional `UPDATE ... RETURNING`; memory and PostgreSQL race tests assert exactly one winner. |
| HIGH | Cookie mutations | A browser could attach the session cookie to a cross-site state-changing request. | Strict same-site cookies plus a session-bound double-submit CSRF check; missing token is denied and tested. |
| HIGH | Account state | A suspended account with an existing cookie could remain active. | Session resolution joins active tenant and active user on every request; suspension regression test returns 401. |
| HIGH | Tenant/mass assignment | A caller could attempt to submit `tenantId` or reuse another tenant's session/resource identifier. | Strict schemas reject extra fields; tenant comes from restaurant resolution then session identity; session revocation/update queries include tenant and user. API tenant-manipulation tests pass. |
| MEDIUM | Session fixation/credential ambiguity | A pre-existing attacker cookie could be adopted, or cookie and bearer credentials could resolve ambiguously. | Every authentication issues fresh random credentials; dual transport is rejected. Both cases are API-tested. |
| MEDIUM | Recovery enumeration | Recovery timing/response could distinguish staff accounts. | Uniform response/error behavior, dummy password hashing for login, layered limits, and a minimum recovery-response duration. |
| MEDIUM | Runtime database deletion | Default runtime privileges could delete authentication evidence/state. | Migration revokes deletion of users, sessions, OTPs, tokens, and MFA rows; Docker-backed privilege assertion added. |
| MEDIUM | Browser API CSP | The existing `connect-src 'self'` would block the API when web/API use different origins. | CSP now includes only the configured API origin; production CORS remains allowlisted. Build verifies the configuration. |
| MEDIUM | Validation error boundary | Invalid phone input or a weak recovery password could fall through as an internal error, obscuring the correct client behavior. | Identity validation is translated into stable safe 400 errors; phone and password-policy regression tests pass. |
| LOW | OTP delivery failures | Failure returned safely but was not observable as a security/operational event. | Records delivery status and a metadata-only `OTP_DELIVERY_FAILED` event without phone/code. |

## Adversarial verification

Automated attempts cover invalid/expired/replayed OTPs, five-guess exhaustion, resend and request abuse, simultaneous OTP use, simultaneous invitation use, invalid and suspended staff, TOTP failure, password-reset reuse, session replay after logout, session fixation, missing CSRF, dual credentials, non-JSON input, strict-object mass assignment, customer-to-staff access, phone-change session revocation, and secret absence from event serialization. Existing Phase 0 tests continue covering forged tenant/role headers, IDOR boundaries, malformed/prototype-polluting input, body limits, request IDs, audit attribution, and idempotency races.

SQL uses tagged-template parameters. Authentication does not build identifiers from external data. The OTP webhook URL is fixed configuration and therefore does not create an SSRF input. AI and local-agent components remain absent and have no identity/database path.

## Accepted low-risk findings

| Severity | Finding | Acceptance and next gate |
|---|---|---|
| LOW | Provider-specific SMS and WhatsApp integrations are not selected. | The real signed webhook adapter fails closed when unconfigured. Provider certification, delivery receipt handling, and retention review are deployment gates, not fake local delivery. |
| LOW | MFA enrollment, factor recovery, and staff invitation acceptance APIs are not exposed. | Cryptography, persistence, login enforcement, and atomically single-use invitation primitives are implemented. Phase 2 must add authorized administration and recovery ceremonies before privileged accounts are provisioned. |
| LOW | CSP still requires Next.js inline scripts/styles. | No user-controlled HTML is rendered. Replace with nonce/hash CSP when ingress-supported nonces are introduced; never add `unsafe-eval`. |
| LOW | Database RLS remains unevaluated. | Composite tenant constraints and server-derived context protect current identity queries. Re-evaluate before tenant business tables in Phase 4. |
| INFORMATIONAL | Local Docker engine is stopped. | PostgreSQL migration, runtime-role, and concurrent database tests remain CI-enforced and locally skipped without `TEST_DATABASE_URL`. Do not weaken them. |

## Final verdict

PASS WITH ACCEPTED LOW-RISK FINDINGS
