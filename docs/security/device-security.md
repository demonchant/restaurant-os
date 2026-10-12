# Device security

## Credential lifecycle

- Enrollment and rotation tokens use cryptographic randomness, tenant/device binding, expiry, one-time conditional consumption, keyed hashes at rest, and per-IP/per-token limits.
- Permanent credentials are returned once to the device and never appear in administration reads, audit events, security events, or logs.
- The independent `DEVICE_CREDENTIAL_PEPPER` must come from the production secret manager and must not equal session, OTP, or identity-token secrets.
- Disabled/revoked devices fail every authenticated operation. Revocation clears credentials without relying on device cooperation.
- Rotation requires the current credential plus an administrator-issued one-time token; neither factor alone can rotate.

Device IDs, hostnames, IP addresses, MAC addresses, last-seen data, and software versions are not proof of identity. Heartbeat is operational metadata, not authorization.

## Threat handling

Cross-tenant and cross-location administration uses server-derived tenant context plus source/destination location policy. Strict schemas reject submitted tenant, status, credential, arbitrary device type, or permission fields. Failed/revoked credential use and enrollment/rotation failures generate metadata-only security events.

Future local-agent commands must be a versioned allowlist. A cloud payload can name a supported operation and validated arguments only; it cannot provide commands, scripts, paths, URLs for proxying, or executable update content. Updates require a signed artifact, pinned trust root, rollback protection, and an audited rollout policy.

## Operational handling

Treat one-time tokens and permanent credentials as secrets. Do not paste them into tickets or chat. Prefer direct local-agent enrollment into the operating-system secret store. On suspected compromise, revoke first, preserve evidence, create a replacement identity, and investigate before reuse.
