# Authentication API

All request bodies are strict JSON objects. Unknown fields, malformed phone/email/code values, unsupported content types, oversized payloads, and unsafe credential combinations are rejected. Success and error envelopes follow [the API convention](./overview.md).

## Public authentication

| Method and path | Purpose |
|---|---|
| `POST /api/v1/auth/customer/request-otp` | Resolve a restaurant, normalize a phone, and deliver an SMS or WhatsApp OTP. |
| `POST /api/v1/auth/customer/verify-otp` | Atomically consume an OTP, create/restore a customer, and issue cookies. |
| `POST /api/v1/auth/staff/login` | Verify tenant-scoped staff credentials; returns cookies or an MFA challenge. |
| `POST /api/v1/auth/staff/verify-mfa` | Consume a TOTP challenge and issue an assurance-level-2 session. |
| `POST /api/v1/auth/staff/request-password-reset` | Return a uniform recovery response and deliver an OTP when eligible. |
| `POST /api/v1/auth/staff/reset-password` | Consume recovery verification, replace the Argon2id hash, and revoke sessions. |

## Authenticated identity

| Method and path | Purpose |
|---|---|
| `GET /api/v1/auth/me` | Current server-derived identity and permissions. |
| `GET /api/v1/auth/staff/me` | Staff-only identity boundary. |
| `GET /api/v1/auth/sessions` | Current and other unexpired sessions, without tokens/fingerprints. |
| `POST /api/v1/auth/logout` | Revoke the current session and clear cookies. |
| `POST /api/v1/auth/logout-all` | Revoke every session for the current user. |
| `POST /api/v1/auth/sessions/:sessionId/revoke` | Revoke only a session owned by the current tenant/user. |
| `POST /api/v1/auth/customer/phone-change/request` | Deliver verification to a proposed new number. |
| `POST /api/v1/auth/customer/phone-change/verify` | Apply the verified number and revoke other sessions. |

Cookie-authenticated POST requests require `X-CSRF-Token` equal to the `ros_csrf` cookie. The `ros_session` cookie is HttpOnly. Clients must not copy either value into local storage. Authentication responses are not safe to cache.

`restaurantSlug` is a public restaurant selector, not tenant authority. Authenticated endpoints ignore client tenant claims and use only the session principal.
