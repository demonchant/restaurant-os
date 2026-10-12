# Monitoring

Fastify produces structured request completion logs including request ID, status and response time; the logger adds service and environment and redacts security fields. `/health` distinguishes process liveness and `/ready` checks PostgreSQL and Redis without revealing connection details.

Production telemetry should export request rate/error/latency, event-loop and memory pressure, database pool saturation/query latency, Redis latency, security-event rates, authentication failures, and idempotency conflicts to the selected monitoring platform. Alert on readiness failure, sustained 5xx/error latency, database exhaustion, backup failure, critical security events, and anomalous cross-tenant denials. Tracing/exporter selection is deferred until deployment infrastructure is selected; request IDs already provide correlation.
