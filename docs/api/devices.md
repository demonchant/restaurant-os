# Devices API

Administrative endpoints require staff sessions, granular permissions, location scope, and CSRF on mutations.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/devices` | List authorized devices without credentials |
| POST | `/api/v1/devices` | Create pending device and one-time enrollment token |
| GET | `/api/v1/devices/:deviceId` | Read device metadata |
| PATCH | `/api/v1/devices/:deviceId` | Rename, relocate, disable, or reactivate |
| POST | `/api/v1/devices/:deviceId/revoke` | Permanently revoke with an audited reason |
| POST | `/api/v1/devices/:deviceId/rotate` | Create a one-time rotation token |
| POST | `/api/v1/devices/enroll` | Consume enrollment token and return credential once |
| POST | `/api/v1/devices/rotation/complete` | Present rotation token plus current `Device` authorization |
| POST | `/api/v1/devices/heartbeat` | Authenticated software-version/health heartbeat |

Public ceremony endpoints use strict bodies, global API limits, and dedicated Redis limits. Error responses do not distinguish missing, expired, consumed, revoked, or wrong-tenant credentials. Device administration never returns a permanent credential.
