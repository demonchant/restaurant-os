# Availability resolution

Availability is resolved server-side for a tenant and authorized location. Product and ingredient overrides are `AVAILABLE` or `UNAVAILABLE`; absence of an override means available in Phase 4. Inventory quantities and `LOW_STOCK` belong to Phase 5.

Resolution order:

1. Reject inactive or manually unavailable base products.
2. Reject a product when a required ingredient is unavailable.
3. Keep the product available when only an optional ingredient is unavailable.
4. Resolve each option product and its required ingredients.
5. Remove unavailable options.
6. Reject the configuration when remaining options cannot satisfy a component group's minimum selection count.

Availability changes use optimistic versions and are location-scoped. They require menu-update authority within the actor's location scope and record actor, reason, location, resource, old concurrency version and new version. Public menu responses expose availability outcomes—not stock quantities or internal operational reasons.
