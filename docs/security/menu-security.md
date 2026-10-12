# Menu security model

Primary assets are price integrity, published menu integrity, tenant/location isolation and truthful availability. The main attackers are compromised staff accounts, malicious clients altering requests, cross-tenant users and concurrent administrators.

Controls include server-side RBAC, location scope checks, strict runtime schemas, integer price calculation, composite tenant/menu foreign keys, optimistic versions, serialized publication, immutable hashed publication snapshots, audit events and security-event handling through the existing authorization boundary.

The public API is an allowlisted projection. It never accepts prices and never returns costs, stock quantities, dependency details, drafts, archives or unavailable options. AI receives the same structured projection and must use application tools; it has no database or menu-write path.

PostgreSQL RLS was reevaluated in Phase 4. It is not enabled yet: the current pooled driver lacks a single mandatory transaction wrapper that safely sets and clears tenant context, and partial RLS would create false confidence. Isolation instead uses composite foreign keys plus mandatory tenant predicates and negative tests. RLS remains a tracked defense-in-depth item before broader financial tables, conditional on introducing a fail-closed transaction-local tenant context.

Database application credentials receive only required table privileges. Publication rows cannot be updated/deleted by the application role. Production operators must separate migration credentials from runtime credentials.
