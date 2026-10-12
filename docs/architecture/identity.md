# Identity architecture

Phase 1 separates customer, staff, and privileged authentication while producing one server-validated session principal. Tenant context is resolved from the restaurant slug at the public entry point, persisted with the identity/challenge/session, and thereafter derived only from the authenticated session.

```text
Customer phone -> normalized E.164 -> hashed one-use OTP -> customer identity -> session
Staff email + password -> Argon2id verification -> optional TOTP -> staff identity -> session
Session token -> peppered hash lookup -> active tenant + active user + roles/permissions
```

Customers are tenant-associated and contain only identity data in this phase. A verified number change updates the number transactionally and revokes every other session. Staff identity creation and role administration are deliberately reserved for Phase 2; Phase 1 supplies the password authentication, recovery, MFA challenge, invitation-token, and session primitives they require.

Sessions use 32-byte opaque random tokens. Only a peppered token hash is stored. Authentication always issues a new identifier, so a caller-supplied cookie cannot be adopted as the authenticated session. Cookie sessions use `HttpOnly`, `SameSite=Strict`, production `Secure`, and a separate double-submit CSRF value whose hash is bound to the server session. Bearer sessions do not use CSRF protection because browsers do not attach them implicitly. Supplying bearer and cookie credentials together is rejected.

Account and tenant status are checked on every session resolution. Revocation, expiration, logout, logout-all, password-reset revocation, and approximate last activity are server-side. Privileged sessions have a shorter configurable TTL and assurance level 2 only after TOTP. There is no trusted-device MFA bypass in Phase 1.

OTP delivery is an application interface. The supplied production adapter calls one fixed server-configured webhook with a timestamped HMAC signature and timeout; no client can select a URL or provider. Provider-specific SMS and WhatsApp adapters can replace it without changing authentication logic.

One-time identity tokens are opaque, hashed, expiring, revocable, purpose-bound, and atomically consumed. Phase 2 must use this primitive for staff invitation acceptance rather than inventing a second token design.
