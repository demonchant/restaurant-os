# Locations API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/locations` | List locations visible to the actor |
| POST | `/api/v1/locations` | Create a tenant location |
| GET | `/api/v1/locations/:locationId` | Read an authorized location |
| PATCH | `/api/v1/locations/:locationId` | Update profile/configuration/status |
| GET | `/api/v1/staff/:staffId/locations` | Read staff location scope |
| POST | `/api/v1/staff/:staffId/locations` | Assign a location and revoke sessions |
| DELETE | `/api/v1/staff/:staffId/locations/:locationId` | Remove an assignment and revoke sessions |

Inputs are strict and never accept tenant ownership. Location-scoped actors receive safe not-found responses for inaccessible IDs. Staff assignment additionally enforces Phase 2 rank, self-management, and permission policy. The final location assignment cannot be removed through the delete endpoint; administrators must explicitly change the profile scope using the protected staff update workflow.
