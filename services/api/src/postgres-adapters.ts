import type { DatabaseConnection } from '@restaurant-os/database';
import type { Principal } from '@restaurant-os/types';
import type { EventContext, EventSink, IdempotencyClaim, IdempotencyResult, IdempotencyScope, IdempotencyStore, SessionStore } from './contracts.js';

interface SessionRow { id: string; tenant_id: string; user_id: string; kind: 'CUSTOMER' | 'STAFF'; assurance_level: number; csrf_token_hash: string | null; permission_code: string | null; role_code:string|null; access_scope:'TENANT'|'LOCATIONS'|null;location_id:string|null; }
export class PostgresSessionStore implements SessionStore {
  constructor(private readonly connection: DatabaseConnection) {}
  async findByTokenHash(hash: string, now: Date): Promise<Principal | null> {
    const rows = await this.connection.sql<SessionRow[]>`
      SELECT s.id, s.tenant_id, s.user_id, u.kind, s.assurance_level, s.csrf_token_hash, rp.permission_code,r.code AS role_code,sp.access_scope,sla.location_id FROM sessions s
      JOIN tenants t ON t.id = s.tenant_id
      JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = s.tenant_id
      LEFT JOIN roles r ON r.id=ur.role_id AND r.tenant_id=ur.tenant_id
      LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.tenant_id = s.tenant_id
      LEFT JOIN staff_profiles sp ON sp.user_id=u.id AND sp.tenant_id=u.tenant_id
      LEFT JOIN staff_location_access sla ON sla.user_id=u.id AND sla.tenant_id=u.tenant_id
      WHERE s.token_hash = ${hash} AND s.revoked_at IS NULL AND s.expires_at > ${now} AND u.status = 'ACTIVE' AND t.status = 'ACTIVE'`;
    const first = rows[0]; if (!first) return null;
    await this.connection.sql`UPDATE sessions SET last_seen_at=${now} WHERE id=${first.id} AND last_seen_at < ${new Date(now.getTime() - 5 * 60_000)}`;
    return { userId: first.user_id, tenantId: first.tenant_id, sessionId: first.id, kind: first.kind, assuranceLevel: first.assurance_level, ...(first.csrf_token_hash ? { csrfTokenHash: first.csrf_token_hash } : {}), permissions: new Set(rows.flatMap((row) => row.permission_code ? [row.permission_code] : [])),roleCodes:new Set(rows.flatMap((row)=>row.role_code?[row.role_code]:[])),locationScope:first.access_scope,locationIds:new Set(rows.flatMap((row)=>row.location_id?[row.location_id]:[])) };
  }
}

export class PostgresEventSink implements EventSink {
  constructor(private readonly connection: DatabaseConnection) {}
  async audit(action: string, resourceType: string, resourceId: string | undefined, context: EventContext): Promise<void> {
    if (!context.tenantId) throw new Error('Tenant context is required for audit events');
    await this.connection.sql`INSERT INTO audit_logs (tenant_id, actor_id, action, resource_type, resource_id, request_id, metadata) VALUES (${context.tenantId}, ${context.actorId ?? null}, ${action}, ${resourceType}, ${resourceId ?? null}, ${context.requestId}, ${JSON.stringify(context.metadata ?? {})}::jsonb)`;
  }
  async security(eventType: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', context: EventContext): Promise<void> {
    await this.connection.sql`INSERT INTO security_events (tenant_id, actor_id, event_type, severity, request_id, metadata) VALUES (${context.tenantId ?? null}, ${context.actorId ?? null}, ${eventType}, ${severity}, ${context.requestId}, ${JSON.stringify(context.metadata ?? {})}::jsonb)`;
  }
}

interface IdempotencyRow { response_status: number | null; response_body: unknown; request_hash: string; }
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly connection: DatabaseConnection) {}
  async claim(scope: IdempotencyScope, requestHash: string): Promise<IdempotencyClaim> {
    return this.connection.sql.begin(async (sql) => {
      await sql`DELETE FROM idempotency_records WHERE tenant_id=${scope.tenantId} AND actor_id=${scope.actorId} AND action=${scope.action} AND key_hash=${scope.keyHash} AND expires_at <= now()`;
      const inserted = await sql<{ id: string }[]>`INSERT INTO idempotency_records (tenant_id,actor_id,action,key_hash,request_hash,expires_at) VALUES (${scope.tenantId},${scope.actorId},${scope.action},${scope.keyHash},${requestHash},now()+interval '24 hours') ON CONFLICT (tenant_id,actor_id,action,key_hash) DO NOTHING RETURNING id`;
      if (inserted[0]) return { state: 'acquired' };
      const rows = await sql<IdempotencyRow[]>`SELECT response_status,response_body,request_hash FROM idempotency_records WHERE tenant_id=${scope.tenantId} AND actor_id=${scope.actorId} AND action=${scope.action} AND key_hash=${scope.keyHash} AND expires_at > now()`;
      const row = rows[0];
      if (!row) return { state: 'in_progress' };
      if (row.request_hash !== requestHash) return { state: 'conflict' };
      if (row.response_status === null) return { state: 'in_progress' };
      return { state: 'replay', result: { status: row.response_status, body: row.response_body, requestHash: row.request_hash } };
    });
  }
  async complete(scope: IdempotencyScope, result: IdempotencyResult): Promise<void> {
    const rows = await this.connection.sql<{ id: string }[]>`UPDATE idempotency_records SET response_status=${result.status},response_body=${JSON.stringify(result.body)}::jsonb,locked=false WHERE tenant_id=${scope.tenantId} AND actor_id=${scope.actorId} AND action=${scope.action} AND key_hash=${scope.keyHash} AND request_hash=${result.requestHash} AND locked=true AND expires_at > now() RETURNING id`;
    if (!rows[0]) throw new Error('Idempotency claim could not be completed');
  }
}
