import type { DatabaseConnection } from '@restaurant-os/database';
import { createOpaqueToken, hashToken } from '@restaurant-os/security';

export type IdentityTokenPurpose = 'STAFF_INVITATION' | 'ACCOUNT_RECOVERY';

export interface IdentityTokenRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  purpose: IdentityTokenPurpose;
  target: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface IdentityTokenStore {
  create(input: Omit<IdentityTokenRecord, 'id' | 'consumedAt'> & { tokenHash: string }): Promise<string>;
  consume(tokenHash: string, purpose: IdentityTokenPurpose, now: Date): Promise<IdentityTokenRecord | null>;
  revoke(id: string, tenantId: string, now: Date): Promise<boolean>;
}

export class OneTimeIdentityTokens {
  constructor(private readonly store: IdentityTokenStore, private readonly pepper: string) {}

  async issue(input: Omit<IdentityTokenRecord, 'id' | 'consumedAt'>): Promise<{ id: string; token: string }> {
    const token = createOpaqueToken();
    const id = await this.store.create({ ...input, tokenHash: hashToken(token, this.pepper) });
    return { id, token };
  }

  consume(token: string, purpose: IdentityTokenPurpose, now = new Date()): Promise<IdentityTokenRecord | null> {
    return this.store.consume(hashToken(token, this.pepper), purpose, now);
  }

  revoke(id: string, tenantId: string, now = new Date()): Promise<boolean> {
    return this.store.revoke(id, tenantId, now);
  }
}

interface IdentityTokenRow {
  id: string; tenant_id: string; user_id: string | null; purpose: IdentityTokenPurpose; target: string | null;
  expires_at: Date; consumed_at: Date | null;
}

const mapToken = (row: IdentityTokenRow): IdentityTokenRecord => ({
  id: row.id, tenantId: row.tenant_id, userId: row.user_id, purpose: row.purpose,
  target: row.target, expiresAt: row.expires_at, consumedAt: row.consumed_at,
});

export class PostgresIdentityTokenStore implements IdentityTokenStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async create(input: Omit<IdentityTokenRecord, 'id' | 'consumedAt'> & { tokenHash: string }): Promise<string> {
    const id = crypto.randomUUID();
    await this.connection.sql`INSERT INTO identity_tokens (id,tenant_id,user_id,purpose,token_hash,target,expires_at) VALUES (${id},${input.tenantId},${input.userId},${input.purpose},${input.tokenHash},${input.target},${input.expiresAt})`;
    return id;
  }

  async consume(tokenHash: string, purpose: IdentityTokenPurpose, now: Date): Promise<IdentityTokenRecord | null> {
    const rows = await this.connection.sql<IdentityTokenRow[]>`UPDATE identity_tokens SET consumed_at=${now} WHERE token_hash=${tokenHash} AND purpose=${purpose} AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>${now} RETURNING id,tenant_id,user_id,purpose,target,expires_at,consumed_at`;
    return rows[0] ? mapToken(rows[0]) : null;
  }

  async revoke(id: string, tenantId: string, now: Date): Promise<boolean> {
    const rows = await this.connection.sql<{ id: string }[]>`UPDATE identity_tokens SET revoked_at=${now} WHERE id=${id} AND tenant_id=${tenantId} AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id`;
    return Boolean(rows[0]);
  }
}
