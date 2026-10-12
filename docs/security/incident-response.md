# Incident response

Preserve request IDs, audit/security events, provider events, device records, and relevant immutable logs. Do not destroy evidence while containing an incident.

1. Triage scope, affected tenants/assets, active abuse, and legal/privacy impact.
2. Contain by revoking sessions/devices/keys, disabling compromised integrations or features, and restricting network/database access.
3. Investigate the initial access, lateral movement, data and money impact, persistence, and audit integrity.
4. Eradicate the weakness, rotate credentials from a trusted environment, patch, and validate tenant boundaries.
5. Restore from verified artifacts/backups, reconcile payments/orders where relevant, and monitor heightened signals.
6. Notify affected stakeholders and authorities according to contracts and applicable law; document timeline and decisions.
7. Complete a blameless post-incident review with owned actions and verification dates.

Staff compromise revokes all sessions and resets MFA/credentials. Admin compromise additionally freezes sensitive administration and reviews grants/audit. Payment compromise disables the adapter and reconciles directly with provider records. Local-agent compromise revokes device identity and rebuilds the host. Suspected exposure triggers preservation, access analysis, minimization, notification assessment, and monitored recovery.
