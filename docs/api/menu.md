# Menu API

Authenticated administration endpoints live under `/api/v1/menus` and `/api/v1/menu`. They cover menus, categories, products, configurations, ingredients, product dependencies, location availability, server-side quotes, publication and archival.

All write schemas are strict, require JSON, use cookie CSRF protection when applicable, and enforce tenant/location permissions in the service. Prices use `basePriceMinor` and `priceAdjustmentMinor`. Configuration update and publication require expected revisions; availability updates require the current version or `null` for first creation.

`POST /api/v1/menu/configurations/:id/quote` accepts only `locationId`, product `quantity`, and `{optionId, quantity}` selections. The response is calculated by the shared engine.

`GET /api/v1/public/menu?tenantId=...&locationId=...` returns published, displayed, active and currently selectable customer-safe data. It omits inventory quantities, costs, dependencies, audit metadata, draft/archived menus and unavailable options. Unknown or inactive tenant/location combinations produce an empty dataset rather than internal details.

API errors use the Phase 0 envelope and request ID. IDs supplied by clients are always looked up within server-derived tenant context for authenticated routes.
