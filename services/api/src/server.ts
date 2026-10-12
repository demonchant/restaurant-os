import { loadConfig } from '@restaurant-os/config';
import { createDatabase } from '@restaurant-os/database';
import { createLogger } from '@restaurant-os/logging';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { PostgresEventSink, PostgresIdempotencyStore, PostgresSessionStore } from './postgres-adapters.js';
import { RedisAuthRateLimiter, UnavailableOtpDeliveryProvider, WebhookOtpDeliveryProvider } from './auth/infrastructure.js';
import { PostgresAuthStore } from './auth/postgres-store.js';
import { AuthenticationService } from './auth/service.js';
import { PostgresStaffStore } from './staff/postgres-store.js';
import { StaffAdministrationService } from './staff/service.js';
import { UnavailableInvitationDeliveryProvider, WebhookInvitationDeliveryProvider } from './staff/infrastructure.js';
import { PostgresOrganizationStore } from './organization/postgres-store.js';
import { OrganizationService } from './organization/service.js';
import { PostgresMenuStore } from './menu/postgres-store.js';
import { MenuService } from './menu/service.js';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
await redis.connect();
const logger = createLogger('api', config.APP_ENV, config.LOG_LEVEL);
const eventSink = new PostgresEventSink(database);
const delivery = config.OTP_DELIVERY_WEBHOOK_URL && config.OTP_DELIVERY_WEBHOOK_SECRET ? new WebhookOtpDeliveryProvider(config.OTP_DELIVERY_WEBHOOK_URL, config.OTP_DELIVERY_WEBHOOK_SECRET) : new UnavailableOtpDeliveryProvider();
const authentication = new AuthenticationService({
  store: new PostgresAuthStore(database), delivery, limiter: new RedisAuthRateLimiter(redis, config.SESSION_SECRET), events: eventSink,
  otpPepper: config.OTP_PEPPER, sessionPepper: config.SESSION_SECRET, mfaEncryptionKey: config.MFA_ENCRYPTION_KEY,
  defaultCountry: config.DEFAULT_PHONE_COUNTRY, dummyPasswordHash: await hashPassword('dummy credential comparison 7!'),
  sessionTtlSeconds: config.SESSION_TTL_SECONDS, privilegedSessionTtlSeconds: config.PRIVILEGED_SESSION_TTL_SECONDS,
});
const invitationDelivery=config.INVITATION_DELIVERY_WEBHOOK_URL&&config.INVITATION_DELIVERY_WEBHOOK_SECRET?new WebhookInvitationDeliveryProvider(config.INVITATION_DELIVERY_WEBHOOK_URL,config.INVITATION_DELIVERY_WEBHOOK_SECRET):new UnavailableInvitationDeliveryProvider();
const staff=new StaffAdministrationService({store:new PostgresStaffStore(database),events:eventSink,limiter:new RedisAuthRateLimiter(redis,config.SESSION_SECRET),delivery:invitationDelivery,tokenPepper:config.IDENTITY_TOKEN_PEPPER,mfaEncryptionKey:config.MFA_ENCRYPTION_KEY,invitationBaseUrl:`${config.APP_URL}/auth/staff/invitation`});
const organization=new OrganizationService({store:new PostgresOrganizationStore(database),events:eventSink,limiter:new RedisAuthRateLimiter(redis,config.SESSION_SECRET),devicePepper:config.DEVICE_CREDENTIAL_PEPPER,enrollmentPepper:config.IDENTITY_TOKEN_PEPPER});
const menu=new MenuService(new PostgresMenuStore(database),eventSink,async(tenantId)=>{const rows=await database.sql<{currency:string}[]>`SELECT currency FROM restaurants WHERE tenant_id=${tenantId}`;return rows[0]?.currency??'NGN';});
const app = await buildApp({
  sessions: new PostgresSessionStore(database), events: eventSink, idempotency: new PostgresIdempotencyStore(database), authentication, staff, organization, menu, tokenPepper: config.SESSION_SECRET,
  cookie: { secure: config.APP_ENV === 'production', ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}) },
  readiness: { async check() { await database.check(); if ((await redis.ping()) !== 'PONG') throw new Error('Redis unavailable'); } },
}, { logger, corsOrigins: config.CORS_ORIGINS, rateLimitMax: config.RATE_LIMIT_MAX, rateLimitWindowMs: config.RATE_LIMIT_WINDOW_MS, trustProxy: config.TRUST_PROXY });

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, 'Graceful shutdown started'); await app.close(); redis.disconnect(); await database.close(); };
process.once('SIGINT', () => { void shutdown('SIGINT'); }); process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
await app.listen({ host: config.API_HOST, port: config.API_PORT });
import { hashPassword } from '@restaurant-os/auth';
