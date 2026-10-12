# Device architecture

Devices are identities separate from users. The allowlisted registry contains POS, FOH terminal, kitchen terminal, packing terminal, printer, and local agent. Each device is tenant/location-bound and has `PENDING`, `ACTIVE`, `DISABLED`, or `REVOKED` status.

An administrator creates a pending device and receives a cryptographically random, hashed-at-rest, 15-minute enrollment token. Atomic consumption activates the device and returns one credential once to the enrolling device. The stored credential is a keyed hash using an independent pepper. Authentication uses `Device <device-id>.<secret>` and derives tenant/location from the database.

Rotation is a two-party ceremony: an authorized administrator issues a ten-minute one-time token, and the active device must present both that token and its current credential. Completion atomically replaces the hash and increments the credential version. Old credentials stop working immediately. Revocation clears the hash and revokes all incomplete ceremonies server-side.

Heartbeat is authenticated, rate-limited, and stores only software version and last-seen time. Online/offline/degraded presentation will be derived later and never grants authorization. Future staff/device sessions must independently authorize both identities and their common location.

The local agent is not implemented in Phase 3. Its future protocol is capability-based and allowlisted: authenticated command, device/location authorization, strict schema validation, execution by a named handler, and audit. It will never expose arbitrary shell/script execution, filesystem access, network proxying, or unsigned updates.
