# Architecture overview

## Decision record

The foundation uses a TypeScript monorepo because shared contracts and security utilities can be checked without sharing business implementation. Fastify provides a small, schema-friendly HTTP core; PostgreSQL remains the durable source of truth; Redis is coordination infrastructure, not durable truth; Drizzle keeps migrations and SQL visible. Next.js supplies a server-capable commerce frontend without putting domain rules into React.

Implemented deployables are `apps/web`, `services/api`, and `services/worker`. Admin, POS, kitchen, local-agent, and AI deployables are deferred until their roadmap phases so empty shells cannot be mistaken for delivered products.

```text
Web -> versioned API -> application boundaries -> PostgreSQL
                         |                    -> Redis coordination
                         +-> authz/audit/security adapters
```

External providers will be introduced behind application-owned adapters. AI and local devices never receive direct database access. All future business tables require `tenant_id`, server-derived tenant context, and tenant-isolation tests.

## Boundaries

- Presentation owns rendering and API consumption only.
- API routes authenticate, validate, authorize, then call application services.
- Database access is held by adapters, not React components or route-independent clients.
- Shared packages are narrow: config, types, authorization, security, logging, database.
- PostgreSQL stores durable records. Redis may rate-limit, coordinate, or queue, but must tolerate loss/rebuild according to the owning feature.

## Architecture decisions still open

Queue technology, object storage, cloud provider, SMS/WhatsApp and payment providers remain unselected. Selecting them before the relevant requirements and contracts exist would create disposable integration work.
