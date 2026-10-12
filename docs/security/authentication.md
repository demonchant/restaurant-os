# Authentication security

## Customer OTP lifecycle

Phone numbers are parsed with country-aware validation and stored in E.164 format. OTPs contain six digits from Node's cryptographic random source. Persistence contains an HMAC-SHA-256 verification value, never the code. A challenge expires after five minutes, permits five failures, has a 60-second resend delay, and is consumed with one conditional database update so concurrent verification has one winner.

Redis applies separate fixed-window limits by IP, normalized target/account, and challenge. Subjects are HMACed before becoming Redis keys. A Redis failure fails the request closed. Customer-login responses do not disclose whether an account already exists. Password-recovery responses use the same envelope and a minimum response duration for present and absent staff accounts.

The delivery adapter necessarily receives the plaintext OTP transiently. It must run in the trusted service boundary, use TLS, avoid persistence/logging, and erase provider message content according to the provider retention policy. Codes, passwords, session cookies, authorization headers, API keys, and MFA secrets are covered by structured-log redaction.

## Staff passwords and MFA

Passwords are 12–128 characters, require varied character classes, and use Argon2id with 19,456 KiB memory, two iterations, parallelism one, and a 32-byte hash. Unknown-account attempts verify against a real dummy hash to reduce timing distinction. Login is limited by IP and normalized tenant/account. Errors are uniform.

TOTP secrets use 160 random bits and are encrypted using AES-256-GCM under `MFA_ENCRYPTION_KEY`. API responses never expose stored factors. MFA challenges expire after five minutes, permit five failures, and are consumed atomically. Privileged policy has no recovery-code or trusted-device bypass in this phase; a controlled administrative recovery procedure must be designed before factor-reset endpoints are released.

## Sessions and CSRF

Session and CSRF tokens are independent opaque random values and stored only as peppered hashes. Sessions rotate after login, carry an authentication method and assurance level, expire server-side, and can be individually or globally revoked. Password reset revokes all sessions. Phone change retains only the session that authorized and completed the change.

For cookie authentication, every state-changing authentication endpoint requires both the readable CSRF cookie and matching `X-CSRF-Token`; the server compares its hash to the session record. Cookies are scoped to `/`, strict same-site, HttpOnly for the session, and Secure in production. TLS termination must preserve HTTPS awareness and the configured origin policy.

## Secrets and operations

`SESSION_SECRET`, `OTP_PEPPER`, `MFA_ENCRYPTION_KEY`, and the delivery webhook secret are independent production secrets. Startup rejects missing, malformed, obviously placeholder, or reused session/OTP secrets. Rotation currently requires session invalidation for the session pepper and a controlled re-encryption migration for MFA factors; these procedures must be rehearsed before production enrollment.

Runtime database access can insert/update identity state but cannot delete users, sessions, OTP challenges, identity tokens, or MFA records. Retention cleanup requires a separate narrowly scoped maintenance role and auditable job.
