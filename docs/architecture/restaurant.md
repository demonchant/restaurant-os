# Restaurant architecture

Each tenant represents one restaurant business and owns exactly one restaurant profile. The profile contains legal/display names, minimal business contact data, IANA timezone, ISO-style currency/country codes, operating status, and a deliberately small structured settings object. Arbitrary JSON settings are not accepted by the API.

Restaurant creation is an authenticated upsert through `PATCH /api/v1/restaurant`. PostgreSQL resolves concurrent first writes with `INSERT ... ON CONFLICT DO NOTHING` followed by an update, so exactly one request is audited as `restaurant.created`. Tenant identity always comes from the authenticated principal.

The settings object currently permits only order-number prefix and receipt footer configuration. Operating hours, tax, payments, delivery, printing, and communication configuration remain deferred to their owning phases.
