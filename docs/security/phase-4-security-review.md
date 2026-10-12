# Phase 4 security acceptance review

## Verdict

**PASS WITH ACCEPTED LOW-RISK FINDINGS**

No unresolved CRITICAL or HIGH finding remains in the reviewed implementation. Docker-backed migration and concurrency execution remains an environment gate, not a passed check.

## Findings and remediation

| Severity | Component | Exploit scenario | Resolution |
|---|---|---|---|
| HIGH | Publication concurrency | A configuration edit could occur while publication assembled a snapshot because child edits did not advance the menu revision. | Remediated. All draft mutations serialize on the menu row, increment its revision, and publication creates the snapshot inside its locked transaction. A PostgreSQL race regression test was added. |
| HIGH | Cross-menu relationships | Same-tenant category/group/option identifiers could form relationships across different menus. | Remediated with composite tenant+menu foreign keys and transactional existence checks. Negative PostgreSQL coverage was added. |
| MEDIUM | Silent invalid references | Invalid option-product or ingredient IDs could result in omitted rows instead of rejecting the requested configuration. | Remediated. Missing inserts now abort and roll back the entire transaction. |
| MEDIUM | Client price tampering | A client could attempt to supply a final price alongside selections. | Remediated by strict schemas and server-only calculation. API regression coverage rejects the extra field. |
| LOW | Database RLS | Tenant isolation is enforced in application predicates and composite constraints rather than PostgreSQL RLS. | Accepted temporarily. The rationale and fail-closed prerequisite are documented in `menu-security.md`. |
| INFORMATIONAL | Inventory | Phase 4 availability is explicit AVAILABLE/UNAVAILABLE state and does not infer stock. | Expected Phase 4 scope; Phase 5 owns quantities, low-stock state and deductions. |

## Adversarial coverage

The review exercised option injection, duplicate selection, quantity overflow, negative-price configuration, required/optional ingredient behavior, unavailable-option bypass, strict request price tampering, public draft leakage, cross-tenant relationships, concurrent publication, and edit-versus-publication races. Unit/API coverage runs without Docker; PostgreSQL constraint and race tests require `TEST_DATABASE_URL`.

## Docker acceptance update — 2026-08-28

Migrations through `0007` and all 16 existing PostgreSQL integration tests passed against an isolated Docker PostgreSQL 16 database. Cross-tenant constraints, immutable publication, concurrent publish, and edit-versus-publish serialization are verified.

Workbook import adds no public upload route. It requires active tenant staff with menu-create, menu-update, and pricing-update permissions; validates tenant/menu/category ownership; accepts only draft menus; binds approval to a checksum and live-database preview hash; locks the menu; and commits records, revision, provenance, and audit together. A cross-tenant actor and an invalid preview hash both produced zero writes in PostgreSQL tests. The runtime role can read/insert/update recipes but cannot delete them, and import provenance is append-only.

The security verdict for the Phase 4 platform remains **PASS WITH ACCEPTED LOW-RISK FINDINGS**. The real workbook is on **VERIFICATION HOLD** due to source-data ambiguity, and the importer correctly fails closed rather than weakening pricing or tenant boundaries.
