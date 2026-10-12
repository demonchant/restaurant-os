# Restaurant API

`GET /api/v1/restaurant` requires `restaurant:view`. `PATCH /api/v1/restaurant` requires `restaurant:update`, CSRF protection for cookie sessions, and privileged MFA assurance for OWNER/ADMIN.

The strict update document contains legal/display names, nullable normalized contact email and E.164 phone, validated IANA timezone, three-letter currency, two-letter country, status, and the allowlisted settings object. Tenant ID and arbitrary settings are rejected. The first successful update creates the profile; later updates preserve its identity.
