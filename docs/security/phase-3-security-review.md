# Phase 3 final security acceptance review

Date: 2026-08-17

Scope: restaurant profile/settings, locations, staff location assignments, device registry/types/status, enrollment, authentication, heartbeat, rotation, revocation, API/UI, migration constraints, concurrency, events, and local-agent design boundary.

## Findings and remediation

| Severity | Component | Exploit scenario | Fix and regression evidence |
|---|---|---|---|
| HIGH | Device enrollment | Two concurrent consumers could derive credentials from one setup token. | Token consumption is one conditional transactional update; only the pending device can activate. Memory and PostgreSQL concurrency tests require exactly one winner. |
| HIGH | Credential rotation | Token replay or parallel rotation could preserve multiple valid credentials. | Rotation requires current credential plus active one-time token and atomically replaces one hash/version. Concurrent tests require one winner and prove old-credential replay fails. |
| HIGH | Device revocation | A revoked device could continue authenticating if revocation depended on local logout. | Server changes status, clears credential hash, revokes incomplete ceremonies, and authenticates only ACTIVE/non-revoked rows. Revoked heartbeat regression returns 401 and emits a security event. |
| HIGH | Location authorization | A scoped manager could target a device at an inaccessible source or relocate it to an inaccessible destination. | Service authorizes existing source and requested destination independently; list/read filtering and cross-location negative tests use current principal assignments. |
| MEDIUM | Duplicate registration | Concurrent administrators using the same device name produced a database exception and ambiguous UX. | Tenant/name unique constraint plus store conflict translation yields one creation and one stable 409. Concurrent regression covers it. |
| MEDIUM | Restaurant initialization audit | Read-before-upsert could mark two racing requests as `restaurant.created`. | PostgreSQL now uses conflict-safe insert-returning followed by update, giving one linearized create result. |
| MEDIUM | Device brute force | Public enrollment, rotation, and heartbeat endpoints could be abused without endpoint-specific limits. | Dedicated Redis IP/token buckets supplement the global limiter; failures are safe and metadata-only. |
| MEDIUM | Staff/device identity confusion | Trusting a staff session or a device alone could implicitly authorize the other identity. | Device routes use a separate credential grammar/store; administration uses staff sessions. Architecture explicitly requires independent dual authorization for future operational sessions. |

No unresolved CRITICAL, HIGH, or MEDIUM finding remains in source-reviewed Phase 3 functionality.

## Adversarial coverage

Tests cover submitted tenant/device type/permission fields, customer/FOH direct API access, cross-tenant and cross-location IDs, self/equal-rank staff assignment, enrollment reuse, simultaneous enrollment, credential replay, revoked/disabled credentials, simultaneous rotation/revocation, duplicate device creation, invalid location binding, and token/credential absence from event serialization. Database tests additionally assert composite tenant constraints and restricted deletion of device credential history when PostgreSQL is available.

No local-agent command execution, printing, order synchronization, menu, ordering, payment, inventory, delivery, or AI path exists.

## Accepted low-risk findings and gates

| Severity | Finding | Required gate |
|---|---|---|
| LOW | The setup UI can display a short-lived token and one-time device credential for manual installation. | Production rollout should prefer direct local-agent secret-store enrollment. Never add credential recovery or administration display. |
| LOW | Device credentials are keyed bearer secrets rather than hardware-backed keys or mTLS certificates. | Adequate for the current explicit identity foundation. Reassess hardware-backed keys/mTLS before remote local-agent command delivery or high-scale SaaS deployment. |
| LOW | Online/offline/degraded state is derived only from authenticated last-seen data. | Phase 11 must define thresholds and monitoring; heartbeat must never become authorization evidence. |
| LOW | PostgreSQL row-level security remains unevaluated. | Composite constraints and server-derived scope protect current queries. This remains a mandatory Phase 4 tenant-business-data architecture decision, not permanent debt. |
| INFORMATIONAL | Local Docker daemon remains stopped. | Thirteen PostgreSQL/Docker tests are skipped locally but CI-required. Formal environment acceptance requires migration, database concurrency/runtime-role tests, and container builds unchanged. |

## Final verdict

PASS WITH ACCEPTED LOW-RISK FINDINGS
