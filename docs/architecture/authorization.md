# Authorization architecture

Phase 2 uses tenant-scoped RBAC, granular permissions, and contextual resource policy. Authentication establishes a server-side `Principal`; authorization evaluates that principal against current database assignments on every request. Browser state, submitted tenant identifiers, role names, and hidden controls are never authority.

## Decision path

`authorize(actor, permission, resource)` checks staff identity, tenant equality, the requested permission, and optional location membership. Staff administration then applies contextual policy: account status must remain active, a target must be below the actor's highest role rank, self-management is denied, OWNER cannot be assigned through ordinary administration, and OWNER/ADMIN mutations require MFA-backed assurance level 2.

System role ranks are OWNER 100, ADMIN 80, MANAGER 60, and operational roles 20. Rank is a management boundary, not a substitute for permission checks. Roles and role-permission mappings are tenant-owned. CUSTOMER remains a separate identity kind.

## Location scope

`TENANT` grants authorized access across the tenant. `LOCATIONS` requires at least one tenant-owned location and limits reads and mutations to the actor's assigned location set. The schema uses composite tenant foreign keys for staff and locations. Phase 3 will provide location lifecycle and assignment UX; this phase provides and tests the enforcement boundary.

## Freshness and concurrency

Sessions contain only opaque credentials. Their roles, permissions, status, tenant, and location scope are joined from current database records whenever the session is resolved. Role, scope, MFA, and status changes revoke active sessions. PostgreSQL transactions lock affected users during competing changes; unique constraints make duplicate assignment deterministic. No permission cache exists in Phase 2.

## Owner bootstrap and transfer

System roles are provisioned automatically for each tenant. The first owner is created only by the explicit `bootstrap:owner` operational command, which sends a single-use invitation and does not print its token. Database triggers prevent deletion or suspension of the last active owner. General owner assignment and transfer are deliberately unavailable until a reviewed transfer ceremony is built.

## Extension rule

Later domain services must add a permission to the central registry, define the least-privilege role mapping for that phase, call the central authorization engine, apply resource/location policy, audit sensitive success, and negatively test direct API access. They must not add controller-local role-name checks.
