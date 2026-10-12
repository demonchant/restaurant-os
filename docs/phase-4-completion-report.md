# Phase 4 completion report

## Implementation

Phase 4 adds tenant-scoped menus, categories, typed products, full-package/build-your-own configurations, component groups/options, explicit removals/substitutions, ingredients and dependencies, location availability, deterministic minor-unit pricing, draft publication, immutable hashed snapshots, customer-safe reads, production APIs and a real administration interface.

The shared service is the authoritative boundary for future web, POS, AI and social channels. No Pinchichi data, prices, mock orders, payments or other later-phase functionality was introduced.

## Database and API

Migration `0004_menu_engine` creates eleven menu-domain tables with checks, concurrency versions and runtime-role grants. Migration `0005_misty_silk_fever` applies the adversarial-review composite tenant+menu foreign-key hardening and preserves the current Drizzle snapshot. Publication snapshots are append-only to the runtime role. APIs are documented in `docs/api/menu.md`.

## Security and tests

Pricing, selection and availability unit tests cover additions, removals, quantities, required/optional ingredients, unavailable options, invalid selections and negative results. API tests cover price-field tampering and public response behavior. PostgreSQL tests cover cross-tenant constraints, concurrent publication and publication/edit serialization.

The adversarial review found two HIGH issues (publication race and cross-menu relationships) and two MEDIUM issues (silent invalid references and price-field tampering). All were remediated with regression coverage. The accepted LOW item is deferred RLS as documented; composite constraints and mandatory predicates remain active.

Final local verification on 2026-08-17:

- `pnpm check`: passed (10/10 lint workspaces, 10/10 typecheck workspaces, 10/10 production builds).
- API suite: 85 passed; 16 PostgreSQL tests skipped because `TEST_DATABASE_URL` was unavailable.
- Phase 4 engine/API tests: 11 passed locally.
- Drizzle schema drift: no changes.
- Dependency audit: no known vulnerabilities.
- Sensitive credential-pattern scan: zero matches. The Gitleaks binary was not installed locally; the existing CI Gitleaks job remains the authoritative full-history scan.
- Docker Compose configuration: valid (`compose_exit=0`). Docker Engine: stopped, so migrations, PostgreSQL constraints and concurrency tests were not executed locally.

## Operations

Apply migrations with `pnpm --filter @restaurant-os/database migrate`, then build and start the existing API/web services. Rollback is a forward corrective migration; published snapshots must never be destructively rewritten. Back up PostgreSQL before schema deployment.

Docker-backed migration and concurrency tests must run when Docker is available. A stopped daemon is reported as environment-blocked and must not be represented as a pass.

## Docker-backed verification update — 2026-08-28

The outstanding gate was executed against PostgreSQL 16 in the isolated `pinchichi-phase4-workbook-postgres` container and clearly named `restaurant_os_phase4_workbook_test` database.

- Migrations `0000` through `0007` executed successfully on the fresh database. The first attempt exposed and corrected the unapplied `0006` composite-index ordering before the successful rerun.
- Existing PostgreSQL Phase 0–4 integration suite: 16/16 passed, including tenant/menu relationship constraints and both publication concurrency cases.
- New workbook PostgreSQL suite: 3/3 passed, covering cross-tenant/RBAC rejection, wrong preview-hash rollback, transactional import, concurrent single-commit behavior, authoritative workbook price, cost fields, decimal consumption, provenance, and audit.
- Non-database API suite: 87/87 passed with a 15-second timeout on this resource-constrained host. The one test that exceeded the default five-second batch timeout passed independently in 307 ms.
- API typecheck, lint, and production build passed. Database build passed.
- Real workbook parser regression: 2/2 passed and verified the source checksum before and after inspection.
- The real workbook was inspected and previewed against the isolated database. Preview was correctly rejected with 364 errors and wrote zero ingredients, recipes, products, or import records.

The original Phase 4 platform migration, isolation, pricing, availability, RBAC, audit, and concurrency gate is technically verified. Overall task status remains **VERIFICATION HOLD** because the real initial-data workbook cannot be imported without source-owner decisions on units/cost bases, duplicate recipe names, and the authoritative protein selling-price column. No data should be guessed to clear that hold.

## Phase 5 dependencies

Phase 5 may attach stock quantities, consumption, waste and low-stock resolution to the ingredient identities and location-aware availability resolver. It must not duplicate menu availability or pricing logic. Phase 5 must not start until the workbook validation hold is resolved and an approved preview imports successfully.
