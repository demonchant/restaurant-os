# Security architecture

Tenant identity comes from the server-side session lookup. Client tenant, role, and permission headers are ignored. Opaque session values are stored only as peppered SHA-256 hashes; expiration, revocation, tenant status, and account status are enforced in the database query. Phase 1 adds hashed one-use OTPs, Argon2id staff credentials, encrypted TOTP, session lifecycle endpoints, hardened cookies, and CSRF validation; details are in [authentication.md](../security/authentication.md).

Authorization uses granular permission strings and an explicit tenant assertion. Protected routes enforce both. Business services added later must repeat authorization at their application boundary so an alternate transport cannot bypass it.

HTTP controls include a 1 MiB body ceiling, configured CORS allowlist, rate limiting, CSP/secure headers, request IDs, standardized errors, and production-safe error responses. Logs redact authentication/session/OTP/password/key fields. Authorization failures and invalid sessions create separate security events.

Audit and security tables have no update/delete grant to `PUBLIC`. Production must use separate migration and runtime database roles; the runtime role receives only required CRUD and append-only insert grants. Database row-level security should be evaluated before the first business-domain tables, using transaction-bound tenant context; application checks remain mandatory.

Idempotency is scoped by tenant, actor, action and hashed key, checks the request hash, stores the original response, and expires records. Payment/order phases must execute claim, operation, and response persistence transactionally; the Phase 0 endpoint proves the contract but is not a payment/order implementation.

Webhook, upload, AI, and local-agent requirements are specified in the threat model and secure-development guide; no integration endpoint exists yet.
