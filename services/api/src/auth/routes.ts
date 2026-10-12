import type { Principal } from '@restaurant-os/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthenticationController, AuthRequestContext, SessionGrant } from './contracts.js';
import { AuthServiceError } from './service.js';

interface AuthGuards { authenticate: (request: FastifyRequest) => Promise<void>; requireCsrf: (request: FastifyRequest) => Promise<void>; }
interface CookieOptions { secure: boolean; domain?: string; }
const otpChannel = z.enum(['SMS', 'WHATSAPP']);
const challengeSchema = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const result = schema.safeParse(input); if (!result.success) throw new AuthServiceError(400, 'VALIDATION_ERROR', 'Request validation failed'); return result.data; };
const context = (request: FastifyRequest): AuthRequestContext => ({ requestId: request.id, ip: request.ip, ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}) });
const principal = (request: FastifyRequest): Principal => { if (!request.principal) throw new AuthServiceError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'); return request.principal; };

function setSessionCookies(reply: FastifyReply, grant: SessionGrant, options: CookieOptions): void {
  const shared = { path: '/', secure: options.secure, sameSite: 'strict' as const, expires: grant.expiresAt, ...(options.domain ? { domain: options.domain } : {}) };
  reply.setCookie('ros_session', grant.sessionToken, { ...shared, httpOnly: true });
  reply.setCookie('ros_csrf', grant.csrfToken, { ...shared, httpOnly: false });
}
function clearSessionCookies(reply: FastifyReply, options: CookieOptions): void {
  const shared = { path: '/', ...(options.domain ? { domain: options.domain } : {}) }; reply.clearCookie('ros_session', shared); reply.clearCookie('ros_csrf', shared);
}

export function registerAuthenticationRoutes(app: FastifyInstance, controller: AuthenticationController, guards: AuthGuards, cookies: CookieOptions): void {
  app.post('/api/v1/auth/customer/request-otp', async (request, reply) => {
    const input = parse(z.object({ restaurantSlug: z.string().min(1).max(100), phone: z.string().min(5).max(40), channel: otpChannel.default('SMS') }).strict(), request.body);
    const result = await controller.requestCustomerOtp(input, context(request)); return reply.code(202).send({ data: result, requestId: request.id });
  });
  app.post('/api/v1/auth/customer/verify-otp', async (request, reply) => {
    const input = parse(challengeSchema, request.body); const grant = await controller.verifyCustomerOtp(input, context(request)); setSessionCookies(reply, grant, cookies);
    return reply.send({ data: { user: grant.user, expiresAt: grant.expiresAt }, requestId: request.id });
  });
  app.post('/api/v1/auth/staff/login', async (request, reply) => {
    const input = parse(z.object({ restaurantSlug: z.string().min(1).max(100), email: z.email().max(254), password: z.string().min(1).max(128) }).strict(), request.body);
    const result = await controller.loginStaff(input, context(request)); if (result.mfaRequired) return reply.send({ data: result, requestId: request.id }); setSessionCookies(reply, result.grant, cookies); return reply.send({ data: { mfaRequired: false, user: result.grant.user, expiresAt: result.grant.expiresAt }, requestId: request.id });
  });
  app.post('/api/v1/auth/staff/verify-mfa', async (request, reply) => {
    const grant = await controller.verifyStaffMfa(parse(challengeSchema, request.body), context(request)); setSessionCookies(reply, grant, cookies); return reply.send({ data: { user: grant.user, expiresAt: grant.expiresAt }, requestId: request.id });
  });
  app.post('/api/v1/auth/staff/request-password-reset', async (request, reply) => {
    const input = parse(z.object({ restaurantSlug: z.string().min(1).max(100), email: z.email().max(254), channel: otpChannel.default('SMS') }).strict(), request.body); const result = await controller.requestPasswordReset(input, context(request)); return reply.code(202).send({ data: result, requestId: request.id });
  });
  app.post('/api/v1/auth/staff/reset-password', async (request, reply) => {
    const input = parse(z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(12).max(128) }).strict(), request.body); await controller.resetPassword(input, context(request)); return reply.send({ data: { reset: true }, requestId: request.id });
  });
  app.get('/api/v1/auth/me', { preHandler: guards.authenticate }, (request) => { const actor = principal(request); return { data: { userId: actor.userId, tenantId: actor.tenantId, kind: actor.kind, assuranceLevel: actor.assuranceLevel, permissions: [...actor.permissions].sort(), roleCodes: [...actor.roleCodes].sort(), locationScope: actor.locationScope, locationIds: [...actor.locationIds].sort() }, requestId: request.id }; });
  app.get('/api/v1/auth/staff/me', { preHandler: guards.authenticate }, (request) => { const actor = principal(request); if (actor.kind !== 'STAFF') throw new AuthServiceError(403, 'FORBIDDEN', 'The operation is not permitted'); return { data: { userId: actor.userId, tenantId: actor.tenantId, assuranceLevel: actor.assuranceLevel }, requestId: request.id }; });
  app.get('/api/v1/auth/sessions', { preHandler: guards.authenticate }, async (request) => { const actor = principal(request); const sessions = await controller.listSessions({ tenantId: actor.tenantId, userId: actor.userId, currentSessionId: actor.sessionId }); return { data: sessions, requestId: request.id }; });
  app.post('/api/v1/auth/logout', { preHandler: [guards.authenticate, guards.requireCsrf] }, async (request, reply) => { const actor = principal(request); await controller.revokeSession({ tenantId: actor.tenantId, userId: actor.userId, sessionId: actor.sessionId }, context(request)); clearSessionCookies(reply, cookies); return { data: { loggedOut: true }, requestId: request.id }; });
  app.post('/api/v1/auth/logout-all', { preHandler: [guards.authenticate, guards.requireCsrf] }, async (request, reply) => { const actor = principal(request); const count = await controller.logoutAll({ tenantId: actor.tenantId, userId: actor.userId }, context(request)); clearSessionCookies(reply, cookies); return { data: { revokedSessions: count }, requestId: request.id }; });
  app.post('/api/v1/auth/sessions/:sessionId/revoke', { preHandler: [guards.authenticate, guards.requireCsrf] }, async (request, reply) => { const actor = principal(request); const input = parse(z.object({ sessionId: z.uuid() }), request.params); const revoked = await controller.revokeSession({ tenantId: actor.tenantId, userId: actor.userId, sessionId: input.sessionId }, context(request)); if (input.sessionId === actor.sessionId) clearSessionCookies(reply, cookies); return { data: { revoked }, requestId: request.id }; });
  app.post('/api/v1/auth/customer/phone-change/request', { preHandler: [guards.authenticate, guards.requireCsrf] }, async (request, reply) => { const actor = principal(request); if (actor.kind !== 'CUSTOMER') throw new AuthServiceError(403, 'FORBIDDEN', 'The operation is not permitted'); const body = parse(z.object({ newPhone: z.string().min(5).max(40), channel: otpChannel.default('SMS') }).strict(), request.body); const result = await controller.requestPhoneChange({ tenantId: actor.tenantId, userId: actor.userId, ...body }, context(request)); return reply.code(202).send({ data: result, requestId: request.id }); });
  app.post('/api/v1/auth/customer/phone-change/verify', { preHandler: [guards.authenticate, guards.requireCsrf] }, async (request) => { const actor = principal(request); if (actor.kind !== 'CUSTOMER') throw new AuthServiceError(403, 'FORBIDDEN', 'The operation is not permitted'); const body = parse(challengeSchema, request.body); await controller.verifyPhoneChange({ ...body, tenantId: actor.tenantId, userId: actor.userId, sessionId: actor.sessionId }, context(request)); return { data: { changed: true }, requestId: request.id }; });
}
