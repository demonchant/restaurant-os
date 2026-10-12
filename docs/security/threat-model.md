# Initial threat model

## Scope and trust boundaries

Assets are customer/staff identities and personal data, tenant configuration, future orders/payments/menu/inventory, audit evidence, secrets, devices, and service availability. Trust boundaries exist at the public web/API, authenticated session, tenant boundary, API-to-database/Redis connection, future provider webhook, AI tool boundary, upload storage, and restaurant device connection.

Threat actors include anonymous attackers, malicious customers/employees, compromised accounts/devices/providers, malicious AI input, and supply-chain attackers.

| Threat | Impact | Likelihood | Prevention | Detection and response |
|---|---|---:|---|---|
| Account/OTP takeover | High | High | Hashed OTP/session values, expiry, one use, MFA capability, attempt/resend throttles | Login/OTP security events; revoke sessions and reset factors |
| IDOR or tenant switching | Critical | Medium | Server-derived tenant, permission plus resource checks, tenant-scoped schema and tests | High-severity authorization events; freeze actor and review access |
| Malicious/compromised employee | Critical | Medium | Least privilege, separation of duties, individual identities, audit, approval rules | Behavioral/audit review; suspend account and preserve evidence |
| SQL injection/tampering | Critical | Medium | Runtime validation, parameterized SQL, least-privileged DB role | Query/error anomaly monitoring; isolate service and rotate DB credentials |
| XSS/CSRF/session theft | High | Medium | CSP, output-safe React, secure HttpOnly SameSite cookies when introduced, CSRF token where applicable | CSP/session anomalies; revoke sessions and patch source |
| API DoS/oversized input | High | High | Body limits, endpoint-specific distributed limits, timeouts, capacity controls | Rate/latency/resource alerts; block sources and scale safely |
| Payment/webhook forgery or replay | Critical | High | Provider signature/timestamp verification, server verification, idempotency, reconciliation | Signature/replay events; stop release of orders and reconcile provider ledger |
| Refund/discount/debt/welfare abuse | Critical | Medium | Granular permissions, limits, approvals, atomic ledger and immutable audit | Outlier and reconciliation alerts; freeze capability and investigate |
| Malicious upload | High | Medium | Private object store, generated keys, size/type/signature and malware checks | Scanner/access logs; quarantine and revoke URLs |
| AI prompt/tool injection | Critical | High | No DB access, allowlisted typed tools, normal auth/domain rules, output validation and data minimization | Tool-call/security telemetry; disable tool/agent and review transcript safely |
| Compromised local agent/printer | High | Medium | Per-device revocable credentials, allowlisted signed commands, no shell, least OS privilege | Device anomalies/command audit; revoke and rebuild device |
| Webhook/SSRF pivot | Critical | Medium | Fixed provider endpoints, signature validation, egress allowlist, URL/IP validation | Egress/DNS alerts; isolate workload and rotate integration keys |
| Audit deletion/tampering | Critical | Low | Append-only grants, separate archival/export, restricted admins | Continuity/replication alerts; preserve external copy and investigate |
| Supply-chain compromise/secrets | Critical | Medium | Lockfile, minimum package age, audit, CodeQL, Gitleaks, image pin/scan/sign | CI/SBOM alerts; stop release, rotate secrets, rebuild trusted artifacts |
| Cross-site request forgery | High | Medium | Bearer APIs now; SameSite/CSRF origin/token validation for future cookie mutations | Origin/CSRF failures; revoke affected session |

## Abuse cases verified in Phase 0

Automated tests cover absent/invalid/expired sessions, missing permissions, cross-tenant paths, forged role/tenant headers, malformed UUIDs, replay with changed payload, oversized JSON, abusive request rate, untrusted CORS origin, and path probing. Actual payment, OTP, upload, webhook, AI, and device endpoints do not yet exist and must add feature-specific cases before release.

## Residual risks

Application enforcement is currently the primary tenant boundary; transaction-bound PostgreSQL RLS remains a pre-business-schema hardening decision. Rate limiting is process-local until a Redis-backed distributed policy is installed for authentication/public endpoints. No production ingress, secret manager, SIEM, object store, payment provider, or device PKI is selected. These are explicit deferred risks, not completed controls.
