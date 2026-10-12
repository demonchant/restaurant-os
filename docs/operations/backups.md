# Backup and recovery

Production baseline: encrypted daily full PostgreSQL backups plus continuous WAL/point-in-time recovery, retained 35 days; monthly encrypted archives retained 12 months subject to final legal policy. Keep at least one copy in a separate account/region and protect deletion with restricted credentials. Redis is not a source of durable business truth.

Monitor backup age, failures, WAL continuity, storage integrity, and encryption-key access. Perform an automated restore verification at least monthly and a documented disaster-recovery exercise quarterly. Validate schema, tenant counts, critical record counts, audit continuity, and application readiness after restore. Record achieved RPO/RTO; proposed initial targets are RPO 15 minutes and RTO 4 hours pending business approval.

Restoration requires an incident/change record, isolated target, integrity checks, security review, controlled cutover, and post-restore reconciliation. A backup is not considered proven until restored successfully.
