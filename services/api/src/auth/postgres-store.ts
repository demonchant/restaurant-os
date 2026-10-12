import type { DatabaseConnection } from '@restaurant-os/database';
import type { AuthStore, IdentityUser, MfaChallengeRecord, MfaFactorRecord, NewSession, OtpRecord, OtpPurpose, SessionRecord, TenantIdentity } from './contracts.js';

interface UserRow { id: string; tenant_id: string; kind: 'CUSTOMER' | 'STAFF'; status: string; phone: string | null; email: string | null; password_hash: string | null; mfa_required: boolean; }
interface OtpRow { id: string; tenant_id: string; user_id: string | null; purpose: OtpPurpose; target_phone: string; channel: 'SMS' | 'WHATSAPP'; code_hash: string; attempts: number; max_attempts: number; expires_at: Date; resend_after: Date; consumed_at: Date | null; }
const mapUser = (row: UserRow): IdentityUser => ({ id: row.id, tenantId: row.tenant_id, kind: row.kind, status: row.status, phone: row.phone, email: row.email, passwordHash: row.password_hash, mfaRequired: row.mfa_required });
const mapOtp = (row: OtpRow): OtpRecord => ({ id: row.id, tenantId: row.tenant_id, userId: row.user_id, purpose: row.purpose, targetPhone: row.target_phone, channel: row.channel, codeHash: row.code_hash, attempts: row.attempts, maxAttempts: row.max_attempts, expiresAt: row.expires_at, resendAfter: row.resend_after, consumedAt: row.consumed_at });

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly connection: DatabaseConnection) {}
  async findTenantBySlug(slug: string): Promise<TenantIdentity | null> {
    const rows = await this.connection.sql<{ id: string; slug: string; status: string }[]>`SELECT id,slug,status FROM tenants WHERE slug=${slug}`; return rows[0] ?? null;
  }
  async findRecentOtp(tenantId: string, targetPhone: string, purpose: OtpPurpose) {
    const rows = await this.connection.sql<{ resend_after: Date }[]>`SELECT resend_after FROM otp_challenges WHERE tenant_id=${tenantId} AND target_phone=${targetPhone} AND purpose=${purpose} AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`;
    return rows[0] ? { resendAfter: rows[0].resend_after } : null;
  }
  async createOtp(input: Omit<OtpRecord, 'id' | 'attempts' | 'consumedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    await this.connection.sql`INSERT INTO otp_challenges (id,tenant_id,user_id,purpose,target_phone,channel,code_hash,max_attempts,expires_at,resend_after) VALUES (${id},${input.tenantId},${input.userId},${input.purpose},${input.targetPhone},${input.channel},${input.codeHash},${input.maxAttempts},${input.expiresAt},${input.resendAfter})`; return id;
  }
  async setOtpDeliveryStatus(id: string, status: 'SENT' | 'FAILED'): Promise<void> { await this.connection.sql`UPDATE otp_challenges SET delivery_status=${status} WHERE id=${id}`; }
  async getOtp(id: string): Promise<OtpRecord | null> { const rows = await this.connection.sql<OtpRow[]>`SELECT id,tenant_id,user_id,purpose,target_phone,channel,code_hash,attempts,max_attempts,expires_at,resend_after,consumed_at FROM otp_challenges WHERE id=${id}`; return rows[0] ? mapOtp(rows[0]) : null; }
  async recordOtpFailure(id: string, now: Date): Promise<number | null> {
    const rows = await this.connection.sql<{ remaining: number }[]>`UPDATE otp_challenges SET attempts=attempts+1 WHERE id=${id} AND consumed_at IS NULL AND expires_at>${now} AND attempts<max_attempts RETURNING max_attempts-attempts AS remaining`; return rows[0]?.remaining ?? null;
  }
  async consumeOtp(id: string, now: Date): Promise<OtpRecord | null> {
    const rows = await this.connection.sql<OtpRow[]>`UPDATE otp_challenges SET consumed_at=${now} WHERE id=${id} AND consumed_at IS NULL AND expires_at>${now} AND attempts<max_attempts RETURNING id,tenant_id,user_id,purpose,target_phone,channel,code_hash,attempts,max_attempts,expires_at,resend_after,consumed_at`; return rows[0] ? mapOtp(rows[0]) : null;
  }
  async findOrCreateCustomer(tenantId: string, phone: string, now: Date): Promise<IdentityUser> {
    return this.connection.sql.begin(async (sql) => {
      await sql`INSERT INTO users (tenant_id,kind,phone,phone_verified_at,status) VALUES (${tenantId},'CUSTOMER',${phone},${now},'ACTIVE') ON CONFLICT (tenant_id,phone) WHERE phone IS NOT NULL DO NOTHING`;
      const rows = await sql<UserRow[]>`SELECT id,tenant_id,kind,status,phone,email,password_hash,mfa_required FROM users WHERE tenant_id=${tenantId} AND phone=${phone}`;
      const row = rows[0]; if (!row) throw new Error('Customer identity could not be loaded');
      if (row.kind === 'CUSTOMER') await sql`UPDATE users SET phone_verified_at=COALESCE(phone_verified_at,${now}),updated_at=${now} WHERE id=${row.id} AND tenant_id=${tenantId}`;
      return mapUser(row);
    });
  }
  async findStaffByEmail(tenantId: string, email: string): Promise<IdentityUser | null> { const rows = await this.connection.sql<UserRow[]>`SELECT id,tenant_id,kind,status,phone,email,password_hash,mfa_required FROM users WHERE tenant_id=${tenantId} AND email=${email} AND kind='STAFF'`; return rows[0] ? mapUser(rows[0]) : null; }
  async findUserById(tenantId: string, userId: string): Promise<IdentityUser | null> { const rows = await this.connection.sql<UserRow[]>`SELECT id,tenant_id,kind,status,phone,email,password_hash,mfa_required FROM users WHERE tenant_id=${tenantId} AND id=${userId}`; return rows[0] ? mapUser(rows[0]) : null; }
  async createSession(input: NewSession): Promise<void> { await this.connection.sql`INSERT INTO sessions (id,tenant_id,user_id,token_hash,csrf_token_hash,expires_at,auth_method,assurance_level,device_label,user_agent_hash,ip_hash) VALUES (${input.id},${input.tenantId},${input.userId},${input.tokenHash},${input.csrfTokenHash},${input.expiresAt},${input.authMethod},${input.assuranceLevel},${input.deviceLabel},${input.userAgentHash},${input.ipHash})`; }
  async revokeSession(tenantId: string, userId: string, sessionId: string, now: Date): Promise<boolean> { const rows = await this.connection.sql<{ id: string }[]>`UPDATE sessions SET revoked_at=${now} WHERE id=${sessionId} AND tenant_id=${tenantId} AND user_id=${userId} AND revoked_at IS NULL RETURNING id`; return Boolean(rows[0]); }
  async revokeOtherSessions(tenantId: string, userId: string, currentSessionId: string, now: Date): Promise<number> { const rows = await this.connection.sql<{ id: string }[]>`UPDATE sessions SET revoked_at=${now} WHERE tenant_id=${tenantId} AND user_id=${userId} AND id<>${currentSessionId} AND revoked_at IS NULL RETURNING id`; return rows.length; }
  async revokeAllSessions(tenantId: string, userId: string, now: Date): Promise<number> { const rows = await this.connection.sql<{ id: string }[]>`UPDATE sessions SET revoked_at=${now} WHERE tenant_id=${tenantId} AND user_id=${userId} AND revoked_at IS NULL RETURNING id`; return rows.length; }
  async listSessions(tenantId: string, userId: string, now: Date): Promise<SessionRecord[]> {
    const rows = await this.connection.sql<{ id: string; device_label: string | null; last_seen_at: Date; created_at: Date; expires_at: Date; revoked_at: Date | null }[]>`SELECT id,device_label,last_seen_at,created_at,expires_at,revoked_at FROM sessions WHERE tenant_id=${tenantId} AND user_id=${userId} AND expires_at>${now} ORDER BY created_at DESC`;
    return rows.map((row) => ({ id: row.id, deviceLabel: row.device_label, lastSeenAt: row.last_seen_at, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at }));
  }
  async updateCustomerPhoneAndRevokeOthers(tenantId: string, userId: string, phone: string, currentSessionId: string, now: Date): Promise<void> {
    await this.connection.sql.begin(async (sql) => { const users = await sql<{ id: string }[]>`UPDATE users SET phone=${phone},phone_verified_at=${now},updated_at=${now} WHERE id=${userId} AND tenant_id=${tenantId} AND kind='CUSTOMER' AND status='ACTIVE' RETURNING id`; if (!users[0]) throw new Error('Customer phone update failed'); await sql`UPDATE sessions SET revoked_at=${now} WHERE tenant_id=${tenantId} AND user_id=${userId} AND id<>${currentSessionId} AND revoked_at IS NULL`; });
  }
  async updatePasswordAndRevokeSessions(tenantId: string, userId: string, passwordHash: string, now: Date): Promise<void> {
    await this.connection.sql.begin(async (sql) => { const users = await sql<{ id: string }[]>`UPDATE users SET password_hash=${passwordHash},password_changed_at=${now},updated_at=${now} WHERE id=${userId} AND tenant_id=${tenantId} AND kind='STAFF' AND status='ACTIVE' RETURNING id`; if (!users[0]) throw new Error('Staff password update failed'); await sql`UPDATE sessions SET revoked_at=${now} WHERE tenant_id=${tenantId} AND user_id=${userId} AND revoked_at IS NULL`; });
  }
  async createMfaChallenge(tenantId: string, userId: string, expiresAt: Date): Promise<string> { const id = crypto.randomUUID(); await this.connection.sql`INSERT INTO mfa_challenges (id,tenant_id,user_id,expires_at) VALUES (${id},${tenantId},${userId},${expiresAt})`; return id; }
  async getMfaChallenge(id: string): Promise<MfaChallengeRecord | null> { const rows = await this.connection.sql<{ id: string; tenant_id: string; user_id: string; attempts: number; max_attempts: number; expires_at: Date; consumed_at: Date | null }[]>`SELECT id,tenant_id,user_id,attempts,max_attempts,expires_at,consumed_at FROM mfa_challenges WHERE id=${id}`; const row=rows[0]; return row ? { id: row.id, tenantId: row.tenant_id, userId: row.user_id, attempts: row.attempts, maxAttempts: row.max_attempts, expiresAt: row.expires_at, consumedAt: row.consumed_at } : null; }
  async recordMfaFailure(id: string, now: Date): Promise<number | null> { const rows = await this.connection.sql<{ remaining: number }[]>`UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=${id} AND consumed_at IS NULL AND expires_at>${now} AND attempts<max_attempts RETURNING max_attempts-attempts AS remaining`; return rows[0]?.remaining ?? null; }
  async consumeMfaChallenge(id: string, now: Date): Promise<MfaChallengeRecord | null> { const rows = await this.connection.sql<{ id: string; tenant_id: string; user_id: string; attempts: number; max_attempts: number; expires_at: Date; consumed_at: Date | null }[]>`UPDATE mfa_challenges SET consumed_at=${now} WHERE id=${id} AND consumed_at IS NULL AND expires_at>${now} AND attempts<max_attempts RETURNING id,tenant_id,user_id,attempts,max_attempts,expires_at,consumed_at`; const row=rows[0]; return row ? { id: row.id, tenantId: row.tenant_id, userId: row.user_id, attempts: row.attempts, maxAttempts: row.max_attempts, expiresAt: row.expires_at, consumedAt: row.consumed_at } : null; }
  async getVerifiedMfaFactor(tenantId: string, userId: string): Promise<MfaFactorRecord | null> { const rows = await this.connection.sql<{ secret_ciphertext: string; secret_iv: string; secret_tag: string }[]>`SELECT secret_ciphertext,secret_iv,secret_tag FROM mfa_factors WHERE tenant_id=${tenantId} AND user_id=${userId} AND verified_at IS NOT NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`; const row=rows[0]; return row ? { ciphertext: row.secret_ciphertext, iv: row.secret_iv, tag: row.secret_tag } : null; }
}
