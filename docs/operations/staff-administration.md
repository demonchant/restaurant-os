# Staff administration operations

## Initial owner

Provision a tenant first, configure the signed invitation delivery adapter and `IDENTITY_TOKEN_PEPPER`, then set `BOOTSTRAP_TENANT_SLUG`, `BOOTSTRAP_OWNER_EMAIL`, and `BOOTSTRAP_OWNER_NAME`. Run `pnpm --filter @restaurant-os/api bootstrap:owner`. The command refuses a missing/inactive tenant or an active/mismatched owner. It can reissue only the sole pending owner's invitation to the same normalized email, revoking previous tokens. It delivers a single-use invitation and prints only non-secret identifiers.

The owner completes the invitation, password, and mandatory TOTP enrollment. Verify the audit record and perform a privileged login before inviting other administrators.

## Routine lifecycle

Use `/staff` to invite staff, review role/status, revoke pending invitations, suspend/reactivate lower-ranked staff, change permitted roles, and revoke sessions. Role/status changes take effect server-side immediately and active sessions are revoked. Dangerous actions require explicit confirmation in the UI.

Operational roles intentionally have no restaurant business permissions yet. Add permissions only in the phase that implements the protected operation. Do not edit role tables manually or grant the runtime database account registry mutation privileges.

## Incident actions

For a suspected compromise, suspend the account and revoke all sessions, preserve audit/security events, rotate affected external invitation credentials if applicable, and investigate before reactivation. A compromised invitation should be revoked and reissued; never transmit tokens in support tickets or logs.

The last active owner cannot be suspended or stripped at the database boundary. Owner transfer and break-glass access are not available; do not bypass the invariant with manual SQL. Escalate to a reviewed recovery procedure.

## Deployment checks

Apply migration `0002_authorization.sql`, verify system role provisioning for existing/new tenants, validate runtime grants, bootstrap the first owner, and smoke-test list/invite/accept/MFA/suspend/reactivate/session revocation. PostgreSQL integration and concurrency tests require `TEST_DATABASE_URL` and remain CI gates when local Docker is unavailable.
