# RBAC and staff-administration security

## Trust boundaries

- Tenant context comes from the authenticated server-side session.
- Permissions and role codes are loaded from current tenant-scoped database assignments.
- Strict request schemas reject `tenantId`, `permissions`, `role`, and other mass-assignment fields.
- Frontend action hiding is only usability; every endpoint independently authenticates, authorizes, validates CSRF where state changes, and applies rank/resource policy.
- System permission and role registries are read-only to the runtime database role.

## Least privilege

OWNER initially receives the complete registry. ADMIN receives staff, audit, settings, and device administration permissions. MANAGER receives staff administration permissions. FOH, KITCHEN, PACKING, and DELIVERY receive no future business permission until its owning phase defines and tests it. New staff receive only explicitly selected roles.

An actor cannot manage itself, an equal/higher-ranked target, another tenant, or locations outside its scope. OWNER is never assignable through the ordinary API. A manager therefore cannot create an admin/owner, suspend another manager, revoke a privileged invitation, or modify another tenant by constructing a request directly.

## Security-sensitive state changes

Invitations are hashed, tenant/recipient-bound, expiring, revocable, and single-use. Invitation links keep the bearer token in the URL fragment and delivery uses a fixed configured endpoint with timestamp/HMAC authentication. ADMIN/OWNER invitations require TOTP enrollment before activation. Role, scope, MFA, and status changes revoke sessions, while current database resolution prevents stale privilege retention even before a client retries.

Audit events identify tenant, actor, target/resource, request ID, and relevant previous/new state. Authorization failures, cross-tenant attempts, and delivery failures use the security-event channel without storing credentials. Ordinary application access cannot update or delete audit evidence.

## Explicit exclusions

There is no break-glass mode, unrestricted global administrator, custom role mutation API, or automatic owner transfer. Introducing any of these requires a new threat model, MFA/reauthentication policy, expiry/review controls, audit/security events, and adversarial tests.
