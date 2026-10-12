# Secure development standard

- Treat body, query, path, headers, webhooks, files, provider data, and AI output as untrusted.
- Validate at runtime and parameterize all SQL.
- Authenticate first; derive tenant and permissions server-side; authorize the exact resource and action.
- Record sensitive mutations in append-only audit storage and suspicious failures as security events.
- Redact credentials, tokens, OTPs, payment secrets, authorization headers, and unnecessary personal data.
- Use cryptographic randomness, short-lived one-time OTP hashes, attempt/resend limits, and revocable sessions.
- Give webhooks signature and timestamp verification, replay storage, idempotency, strict schemas, and asynchronous retries.
- Store uploads privately under generated names after size, signature/MIME, extension, and malware checks; serve with short-lived authorized URLs.
- Give AI only allowlisted tools that re-enter normal validation/authorization/domain services. Treat tool arguments and model output as attacker-controlled.
- Give local agents unique revocable device identities and an allowlist of signed commands. Never add a generic shell command.

Critical dependency or secret-scan failures block release. A committed secret must be revoked/rotated first, then removed from history under incident control; deleting the line alone is insufficient.
