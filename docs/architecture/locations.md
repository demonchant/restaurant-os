# Location architecture

A restaurant owns one or more tenant-bound locations. Each location stores a business name, postal address, country, IANA timezone, operating status, and a minimal `acceptingOperations` configuration flag. It does not implement ordering behavior.

Composite `(id, tenant_id)` relationships prevent a location from referencing another tenant's restaurant. Names are unique inside a tenant. `ACTIVE`, `INACTIVE`, and `SUSPENDED` are explicit database-constrained states.

Staff scope is either `TENANT` or `LOCATIONS`. Location assignments use the Phase 2 staff profile and join table, revoke active staff sessions on change, prohibit self/equal-or-higher-rank mutation, and require both the granular assignment permission and access to the target location. Current session resolution loads assignments from PostgreSQL on every request.

Location-scoped actors see only assigned locations and devices. Creation is tenant-wide because a scoped actor cannot safely expand the tenant's physical boundary. Updates require access to the existing location; device relocation requires authorization at both source and destination.
