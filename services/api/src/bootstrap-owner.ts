import { normalizeEmail } from '@restaurant-os/auth';
import { loadConfig } from '@restaurant-os/config';
import { createDatabase } from '@restaurant-os/database';
import { createOpaqueToken, hashToken } from '@restaurant-os/security';
import { WebhookInvitationDeliveryProvider } from './staff/infrastructure.js';

const config = loadConfig(process.env);
const slug = process.env.BOOTSTRAP_TENANT_SLUG?.trim().toLowerCase();
const emailInput = process.env.BOOTSTRAP_OWNER_EMAIL;
const displayName = process.env.BOOTSTRAP_OWNER_NAME?.trim();
if (!slug || !emailInput || !displayName) throw new Error('BOOTSTRAP_TENANT_SLUG, BOOTSTRAP_OWNER_EMAIL, and BOOTSTRAP_OWNER_NAME are required');
if (!config.INVITATION_DELIVERY_WEBHOOK_URL || !config.INVITATION_DELIVERY_WEBHOOK_SECRET) throw new Error('Invitation delivery configuration is required');

const email = normalizeEmail(emailInput);
const database = createDatabase(config.DATABASE_URL, 1);
const delivery = new WebhookInvitationDeliveryProvider(config.INVITATION_DELIVERY_WEBHOOK_URL, config.INVITATION_DELIVERY_WEBHOOK_SECRET);
const requestId = crypto.randomUUID();

try {
  const result = await database.sql.begin(async (sql) => {
    const tenants = await sql<{ id: string }[]>`SELECT id FROM tenants WHERE slug=${slug} AND status='ACTIVE' FOR UPDATE`;
    const tenant = tenants[0];
    if (!tenant) throw new Error('Active tenant was not found');
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenant.id},0))`;
    const roles = await sql<{ id: string }[]>`SELECT id FROM roles WHERE tenant_id=${tenant.id} AND code='OWNER'`;
    const ownerRole = roles[0];
    if (!ownerRole) throw new Error('OWNER role is not provisioned');

    const owners = await sql<{ id: string; email: string; status: string }[]>`
      SELECT u.id,u.email,u.status FROM user_roles ur JOIN users u ON u.id=ur.user_id AND u.tenant_id=ur.tenant_id
      WHERE ur.tenant_id=${tenant.id} AND ur.role_id=${ownerRole.id} FOR UPDATE`;
    const pending = owners.length === 1 && owners[0]?.status === 'PENDING_INVITATION' ? owners[0] : undefined;
    if (owners.length > 0 && (!pending || pending.email !== email)) throw new Error('An owner assignment already exists; use the protected owner-transfer process');

    const userId = pending?.id ?? crypto.randomUUID();
    const invitationId = crypto.randomUUID();
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    if (pending) {
      await sql`UPDATE identity_tokens SET revoked_at=now() WHERE tenant_id=${tenant.id} AND user_id=${userId} AND purpose='STAFF_INVITATION' AND consumed_at IS NULL AND revoked_at IS NULL`;
      await sql`UPDATE staff_profiles SET display_name=${displayName},updated_at=now() WHERE tenant_id=${tenant.id} AND user_id=${userId}`;
    } else {
      await sql`INSERT INTO users(id,tenant_id,kind,email,status) VALUES(${userId},${tenant.id},'STAFF',${email},'PENDING_INVITATION')`;
      await sql`INSERT INTO staff_profiles(user_id,tenant_id,display_name,access_scope) VALUES(${userId},${tenant.id},${displayName},'TENANT')`;
      await sql`INSERT INTO user_roles(tenant_id,user_id,role_id) VALUES(${tenant.id},${userId},${ownerRole.id})`;
    }
    await sql`INSERT INTO identity_tokens(id,tenant_id,user_id,purpose,token_hash,target,expires_at) VALUES(${invitationId},${tenant.id},${userId},'STAFF_INVITATION',${hashToken(token,config.IDENTITY_TOKEN_PEPPER)},${email},${expiresAt})`;
    const invitationUrl = `${config.APP_URL.replace(/\/$/u, '')}/auth/staff/invitation#token=${encodeURIComponent(token)}`;
    await delivery.deliver({ invitationId, tenantId: tenant.id, email, token, invitationUrl, expiresAt, requestId });
    await sql`INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,request_id,metadata) VALUES(${tenant.id},NULL,${pending ? 'staff.owner_bootstrap_reissued' : 'staff.owner_bootstrap_invited'},'user',${userId},${requestId},${JSON.stringify({ email })}::jsonb)`;
    return { tenantId: tenant.id, userId, invitationId };
  });
  process.stdout.write(`Owner invitation delivered. Tenant ${result.tenantId}; user ${result.userId}; invitation ${result.invitationId}.\n`);
} finally {
  await database.close();
}
