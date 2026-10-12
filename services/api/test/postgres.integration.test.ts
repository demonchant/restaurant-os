import { randomUUID } from 'node:crypto';
import { createDatabase, type DatabaseConnection } from '@restaurant-os/database';
import { hashToken } from '@restaurant-os/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuthStore } from '../src/auth/postgres-store.js';
import { PostgresSessionStore } from '../src/postgres-adapters.js';
import { PostgresOrganizationStore } from '../src/organization/postgres-store.js';
import { PostgresMenuStore } from '../src/menu/postgres-store.js';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('PostgreSQL authentication adapter', () => {
  let connection: DatabaseConnection;
  const tenantA = randomUUID(); const tenantB = randomUUID(); const userA = randomUUID(); const userB = randomUUID();
  let roleA:string;let roleB:string;let ownerRoleA:string; const restaurantA=randomUUID();const restaurantB = randomUUID();const orgLocationA=randomUUID(); const sessionA = randomUUID(); const sessionB = randomUUID(); const activeHash = hashToken('integration-active', 'integration-pepper'); const secondaryHash = hashToken('integration-secondary', 'integration-pepper');

  beforeAll(async () => {
    if (!testUrl || !/(_test|test_)/i.test(testUrl)) throw new Error('Integration tests require a clearly named test database');
    connection = createDatabase(testUrl, 2);
    await connection.sql.begin(async (sql) => {
      await sql`INSERT INTO tenants (id,name,slug) VALUES (${tenantA},'Tenant A',${`test-a-${tenantA}`}),(${tenantB},'Tenant B',${`test-b-${tenantB}`})`;
      await sql`INSERT INTO users (id,tenant_id,email) VALUES (${userA},${tenantA},${`${userA}@test.invalid`}),(${userB},${tenantB},${`${userB}@test.invalid`})`;
      const roleRows=await sql<{id:string;tenant_id:string;code:string}[]>`SELECT id,tenant_id,code FROM roles WHERE tenant_id IN (${tenantA},${tenantB}) AND code IN ('MANAGER','OWNER')`;roleA=roleRows.find((row)=>row.tenant_id===tenantA&&row.code==='MANAGER')!.id;roleB=roleRows.find((row)=>row.tenant_id===tenantB&&row.code==='MANAGER')!.id;ownerRoleA=roleRows.find((row)=>row.tenant_id===tenantA&&row.code==='OWNER')!.id;
      await sql`INSERT INTO restaurants (id,tenant_id,name) VALUES (${restaurantA},${tenantA},'Tenant A restaurant'),(${restaurantB},${tenantB},'Tenant B restaurant')`;
      await sql`INSERT INTO locations(id,tenant_id,restaurant_id,name,address_line_1,city,state) VALUES(${orgLocationA},${tenantA},${restaurantA},'Main','1 Test Road','Lagos','Lagos')`;
      await sql`INSERT INTO permissions (code,description) VALUES ('tenant:read','Read tenant') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES (${tenantA},${userA},${roleA})`;
      await sql`INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES (${tenantA},${userA},${ownerRoleA})`;
      await sql`INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES (${tenantB},${userB},${roleB})`;
      await sql`INSERT INTO sessions (id,tenant_id,user_id,token_hash,expires_at) VALUES (${sessionA},${tenantA},${userA},${activeHash},now()+interval '1 hour')`;
      await sql`INSERT INTO sessions (id,tenant_id,user_id,token_hash,expires_at) VALUES (${sessionB},${tenantB},${userB},${secondaryHash},now()+interval '1 hour')`;
    });
  });

  afterAll(async () => {
    if (!connection) return;
    await connection.sql.begin(async (sql) => {
      await sql`DELETE FROM otp_challenges WHERE tenant_id IN (${tenantA},${tenantB})`; await sql`DELETE FROM identity_tokens WHERE tenant_id IN (${tenantA},${tenantB})`;
      await sql`DELETE FROM menu_publications WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM ingredient_availability WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM product_availability WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM product_ingredient_dependencies WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM option_substitutions WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM component_options WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM component_groups WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM product_configurations WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM menu_products WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM menu_categories WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM ingredients WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM menus WHERE tenant_id IN (${tenantA},${tenantB})`;
      await sql`ALTER TABLE user_roles DISABLE TRIGGER user_roles_last_owner_guard`;await sql`DELETE FROM sessions WHERE id IN (${sessionA},${sessionB})`;
      await sql`DELETE FROM device_enrollment_tokens WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM devices WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM staff_location_access WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM locations WHERE tenant_id IN (${tenantA},${tenantB})`;
      await sql`DELETE FROM user_roles WHERE tenant_id IN (${tenantA},${tenantB})`;await sql`DELETE FROM role_permissions WHERE tenant_id IN (${tenantA},${tenantB})`; await sql`DELETE FROM roles WHERE tenant_id IN (${tenantA},${tenantB})`; await sql`ALTER TABLE user_roles ENABLE TRIGGER user_roles_last_owner_guard`;await sql`DELETE FROM restaurants WHERE id IN (${restaurantA},${restaurantB})`;
      await sql`DELETE FROM users WHERE id IN (${userA},${userB})`; await sql`DELETE FROM tenants WHERE id IN (${tenantA},${tenantB})`;
    });
    await connection.close();
  });

  it('derives tenant and permissions from the stored session, never request headers', async () => {
    const principal = await new PostgresSessionStore(connection).findByTokenHash(activeHash, new Date());
    expect(principal?.tenantId).toBe(tenantA); expect(principal?.permissions.has('tenant:read')).toBe(true); expect(principal?.tenantId).not.toBe(tenantB);
  });

  it('rejects expired sessions at the query boundary', async () => {
    const principal = await new PostgresSessionStore(connection).findByTokenHash(activeHash, new Date(Date.now() + 7_200_000));
    expect(principal).toBeNull();
  });

  it('rejects sessions belonging to a suspended tenant', async () => {
    await connection.sql`UPDATE tenants SET status='SUSPENDED' WHERE id=${tenantA}`;
    try { expect(await new PostgresSessionStore(connection).findByTokenHash(activeHash, new Date())).toBeNull(); }
    finally { await connection.sql`UPDATE tenants SET status='ACTIVE' WHERE id=${tenantA}`; }
  });

  it('resolves permissions from current assignments instead of stale session claims', async () => {
    const store = new PostgresSessionStore(connection);
    expect((await store.findByTokenHash(secondaryHash, new Date()))?.permissions.has('staff:view')).toBe(true);
    await connection.sql`DELETE FROM user_roles WHERE tenant_id=${tenantB} AND user_id=${userB} AND role_id=${roleB}`;
    try { expect((await store.findByTokenHash(secondaryHash, new Date()))?.permissions.has('staff:view')).toBe(false); }
    finally { await connection.sql`INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES (${tenantB},${userB},${roleB})`; }
  });

  it('rejects cross-tenant role assignment at the database boundary', async () => {
    await expect(connection.sql`INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES (${tenantA},${userA},${roleB})`).rejects.toMatchObject({ code: '23503' });
  });

  it('prevents removal or suspension of the last active owner',async()=>{await expect(connection.sql`DELETE FROM user_roles WHERE tenant_id=${tenantA} AND user_id=${userA} AND role_id=${ownerRoleA}`).rejects.toMatchObject({code:'23514'});await expect(connection.sql`UPDATE users SET status='SUSPENDED' WHERE id=${userA} AND tenant_id=${tenantA}`).rejects.toMatchObject({code:'23514'});});

  it('rejects cross-tenant restaurant/location association at the database boundary', async () => {
    await expect(connection.sql`INSERT INTO locations (tenant_id,restaurant_id,name) VALUES (${tenantA},${restaurantB},'Invalid location')`).rejects.toMatchObject({ code: '23503' });
  });

  it('denies the runtime database role permission to alter audit evidence', async () => {
    const role = await connection.sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') AS exists`;
    if (!role[0]?.exists) return;
    const privileges = await connection.sql<{ canInsert: boolean; canUpdate: boolean; canDelete: boolean }[]>`SELECT has_table_privilege('restaurant_os_app','audit_logs','INSERT') AS "canInsert",has_table_privilege('restaurant_os_app','audit_logs','UPDATE') AS "canUpdate",has_table_privilege('restaurant_os_app','audit_logs','DELETE') AS "canDelete"`;
    expect(privileges[0]).toEqual({ canInsert: true, canUpdate: false, canDelete: false });
  });

  it('atomically permits only one concurrent OTP consumer', async () => {
    const store = new PostgresAuthStore(connection); const now = new Date();
    const id = await store.createOtp({ tenantId: tenantA, userId: null, purpose: 'CUSTOMER_LOGIN', targetPhone: '+2348012345678', channel: 'SMS', codeHash: 'test-hash', maxAttempts: 5, expiresAt: new Date(now.getTime() + 60_000), resendAfter: now });
    const results = await Promise.all([store.consumeOtp(id, now), store.consumeOtp(id, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('denies destructive identity-table access to the runtime role', async () => {
    const role = await connection.sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') AS exists`;
    if (!role[0]?.exists) return;
    const privileges = await connection.sql<{ otpDelete: boolean; tokenDelete: boolean; sessionDelete: boolean }[]>`SELECT has_table_privilege('restaurant_os_app','otp_challenges','DELETE') AS "otpDelete",has_table_privilege('restaurant_os_app','identity_tokens','DELETE') AS "tokenDelete",has_table_privilege('restaurant_os_app','sessions','DELETE') AS "sessionDelete"`;
    expect(privileges[0]).toEqual({ otpDelete: false, tokenDelete: false, sessionDelete: false });
  });

  it('atomically permits only one device enrollment and one credential rotation',async()=>{const store=new PostgresOrganizationStore(connection),now=new Date();const enrollmentHash=hashToken(randomUUID(),'integration-device-enrollment');const created=await store.createDevice({tenantId:tenantA,actorId:userA,locationId:orgLocationA,name:`Device ${randomUUID()}`,type:'LOCAL_AGENT',tokenHash:enrollmentHash,expiresAt:new Date(now.getTime()+60_000)},now);const firstHash=hashToken('first-device-secret','integration-device-pepper'),secondHash=hashToken('second-device-secret','integration-device-pepper');const enrollments=await Promise.all([store.consumeEnrollment(enrollmentHash,firstHash,now),store.consumeEnrollment(enrollmentHash,secondHash,now)]);expect(enrollments.filter(Boolean)).toHaveLength(1);const activeHash=(await store.authenticateDevice(created.record.id,firstHash,now))?firstHash:secondHash;const rotationHash=hashToken(randomUUID(),'integration-device-enrollment');expect(await store.createRotation(tenantA,userA,created.record.id,rotationHash,new Date(now.getTime()+60_000),now)).toBe(true);const nextA=hashToken('rotated-a','integration-device-pepper'),nextB=hashToken('rotated-b','integration-device-pepper');const rotations=await Promise.all([store.consumeRotation({tokenHash:rotationHash,deviceId:created.record.id,currentCredentialHash:activeHash,newCredentialHash:nextA,now}),store.consumeRotation({tokenHash:rotationHash,deviceId:created.record.id,currentCredentialHash:activeHash,newCredentialHash:nextB,now})]);expect(rotations.filter(Boolean)).toHaveLength(1);expect(await store.authenticateDevice(created.record.id,activeHash,now)).toBeNull();});

  it('rejects cross-tenant device/location association at the database boundary',async()=>{await expect(connection.sql`INSERT INTO devices(tenant_id,location_id,name,type) VALUES(${tenantB},${orgLocationA},${`Invalid ${randomUUID()}`},'POS')`).rejects.toMatchObject({code:'23503'});});

  it('denies deletion of device credential history to the runtime role',async()=>{const role=await connection.sql<{exists:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') AS exists`;if(!role[0]?.exists)return;const privileges=await connection.sql<{tokenDelete:boolean}[]>`SELECT has_table_privilege('restaurant_os_app','device_enrollment_tokens','DELETE') AS "tokenDelete"`;expect(privileges[0]).toEqual({tokenDelete:false});});

  it('enforces menu tenant relationships at the database boundary',async()=>{const store=new PostgresMenuStore(connection),now=new Date();const menu=await store.createMenu(tenantA,{name:`Tenant menu ${randomUUID()}`,description:''},now);const category=await store.createCategory(tenantA,{menuId:menu.id,name:`Category ${randomUUID()}`,description:'',displayOrder:0,active:true},now);await expect(connection.sql`INSERT INTO menu_products(tenant_id,menu_id,category_id,name,type,base_price_minor) VALUES(${tenantB},${menu.id},${category.id},'Cross tenant','MEAL',0)`).rejects.toMatchObject({code:'23503'});});

  it('publishes one immutable snapshot under concurrent attempts',async()=>{const store=new PostgresMenuStore(connection),now=new Date();const menu=await store.createMenu(tenantA,{name:`Publish ${randomUUID()}`,description:''},now);const category=await store.createCategory(tenantA,{menuId:menu.id,name:`Meals ${randomUUID()}`,description:'',displayOrder:0,active:true},now);const product=await store.createProduct(tenantA,{menuId:menu.id,categoryId:category.id,name:'Test meal',description:'',sku:null,type:'MEAL',basePriceMinor:1000,active:true,displayed:true,displayOrder:0,maximumQuantity:5},now);await store.createConfiguration(tenantA,{productId:product.id,name:'Standard',kind:'SIMPLE',active:true,displayOrder:0,groups:[]},now);const revision=(await store.getMenu(tenantA,menu.id))!.revision;const results=await Promise.all([store.publish(tenantA,menu.id,userA,revision,now),store.publish(tenantA,menu.id,userA,revision,now)]);expect(results.filter(Boolean)).toHaveLength(1);expect((await connection.sql<{count:number}[]>`SELECT count(*)::int count FROM menu_publications WHERE tenant_id=${tenantA} AND menu_id=${menu.id}`)[0]?.count).toBe(1);});

  it('serializes a draft edit against publication on the menu revision',async()=>{const store=new PostgresMenuStore(connection),now=new Date();const draft=await store.createMenu(tenantA,{name:`Race ${randomUUID()}`,description:''},now);const base=await store.createCategory(tenantA,{menuId:draft.id,name:`Base ${randomUUID()}`,description:'',displayOrder:0,active:true},now);const item=await store.createProduct(tenantA,{menuId:draft.id,categoryId:base.id,name:'Race meal',description:'',sku:null,type:'MEAL',basePriceMinor:1000,active:true,displayed:true,displayOrder:0,maximumQuantity:5},now);await store.createConfiguration(tenantA,{productId:item.id,name:'Standard',kind:'SIMPLE',active:true,displayOrder:0,groups:[]},now);const revision=(await store.getMenu(tenantA,draft.id))!.revision;const [edit,publish]=await Promise.allSettled([store.createCategory(tenantA,{menuId:draft.id,name:`Concurrent ${randomUUID()}`,description:'',displayOrder:1,active:true},now),store.publish(tenantA,draft.id,userA,revision,now)]);const current=await store.getMenu(tenantA,draft.id);if(publish.status==='fulfilled'&&publish.value){expect(edit.status).toBe('rejected');expect(current?.status).toBe('PUBLISHED')}else{expect(edit.status).toBe('fulfilled');expect(current?.status).toBe('DRAFT');expect(current?.revision).toBeGreaterThan(revision)}});
});
