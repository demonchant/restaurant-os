import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AuthorizationError, permissions, requirePermission, requireTenant } from '@restaurant-os/authorization';
import { hashToken, requestFingerprint, safeEqual } from '@restaurant-os/security';
import type { Principal } from '@restaurant-os/types';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiDependencies } from './contracts.js';
import { AppError, AuthenticationError, ConflictError } from './errors.js';
import { registerAuthenticationRoutes } from './auth/routes.js';
import { AuthServiceError } from './auth/service.js';
import { registerStaffRoutes } from './staff/routes.js';
import { registerOrganizationRoutes } from './organization/routes.js';
import { registerMenuRoutes } from './menu/routes.js';

declare module 'fastify' { interface FastifyRequest { principal?: Principal; authTransport?: 'bearer' | 'cookie'; } }

export interface BuildOptions {
  logger: false | FastifyBaseLogger;
  corsOrigins: string[]; rateLimitMax: number; rateLimitWindowMs: number; bodyLimit?: number; trustProxy?: boolean;
}

function requestId(request: FastifyRequest): string { return request.id; }
function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}
function requireJsonContentType(request: FastifyRequest): Promise<void> {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return Promise.reject(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request content type is not supported'));
  }
  return Promise.resolve();
}

export async function buildApp(dependencies: ApiDependencies, options: BuildOptions): Promise<FastifyInstance> {
  const logging = options.logger === false ? { logger: false as const } : { loggerInstance: options.logger };
  const app = Fastify({ ...logging, trustProxy: options.trustProxy ?? false, bodyLimit: options.bodyLimit ?? 1_048_576, genReqId: () => crypto.randomUUID() });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, global: true });
  await app.register(cors, { origin: options.corsOrigins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { max: options.rateLimitMax, timeWindow: options.rateLimitWindowMs, keyGenerator: (request) => request.ip });

  app.addHook('onSend', (request, reply, payload, done) => { reply.header('x-request-id', request.id); done(null, payload); });
  app.addHook('preValidation', (request) => {
    if (['POST','PUT','PATCH'].includes(request.method) && request.url.startsWith('/api/v1/')) return requireJsonContentType(request);
    return Promise.resolve();
  });

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    const authorization = request.headers.authorization;
    const bearer = /^Bearer ([A-Za-z0-9_-]{8,256})$/.exec(authorization ?? '')?.[1]; const sessionCookie = request.cookies.ros_session;
    if ((authorization && !bearer) || (bearer && sessionCookie) || (!bearer && !sessionCookie) || (sessionCookie && !/^[A-Za-z0-9_-]{8,256}$/.test(sessionCookie))) throw new AuthenticationError();
    const token = bearer ?? sessionCookie!; const principal = await dependencies.sessions.findByTokenHash(hashToken(token, dependencies.tokenPepper), new Date());
    if (!principal) {
      await dependencies.events.security('INVALID_SESSION', 'MEDIUM', { requestId: requestId(request), metadata: { route: request.routeOptions.url } });
      throw new AuthenticationError();
    }
    request.principal = principal;
    request.authTransport = bearer ? 'bearer' : 'cookie';
  };
  const requireCsrf = async (request: FastifyRequest): Promise<void> => {
    if (request.authTransport !== 'cookie') return;
    const supplied = request.headers['x-csrf-token']; const csrfCookie = request.cookies.ros_csrf; const expected = request.principal?.csrfTokenHash;
    const valid = typeof supplied === 'string' && typeof csrfCookie === 'string' && supplied === csrfCookie && /^[A-Za-z0-9_-]{8,256}$/.test(supplied) && expected && safeEqual(hashToken(supplied, dependencies.tokenPepper), expected);
    if (!valid) { await dependencies.events.security('CSRF_VALIDATION_FAILED', 'HIGH', { requestId: request.id, ...(request.principal?.tenantId ? { tenantId: request.principal.tenantId } : {}), ...(request.principal?.userId ? { actorId: request.principal.userId } : {}) }); throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'Request authenticity validation failed'); }
  };

  app.get('/health', (request) => ({ data: { status: 'ok' }, requestId: requestId(request) }));
  app.get('/ready', async (request, reply) => {
    try { await dependencies.readiness.check(); return { data: { status: 'ready' }, requestId: requestId(request) }; }
    catch { return reply.code(503).send({ error: { code: 'NOT_READY', message: 'Service is not ready' }, requestId: requestId(request) }); }
  });

  app.get('/api/v1/session/me', { preHandler: authenticate }, (request) => {
    const principal = request.principal!;
    return { data: { userId: principal.userId, tenantId: principal.tenantId, permissions: [...principal.permissions].sort() }, requestId: requestId(request) };
  });

  registerAuthenticationRoutes(app, dependencies.authentication, { authenticate, requireCsrf }, dependencies.cookie);
  registerStaffRoutes(app, dependencies.staff, { authenticate, requireCsrf });
  registerOrganizationRoutes(app, dependencies.organization, { authenticate, requireCsrf });
  if(dependencies.menu) registerMenuRoutes(app,dependencies.menu,{authenticate,requireCsrf});

  app.get('/api/v1/tenants/:tenantId', { preHandler: authenticate }, async (request) => {
    const parsed = z.object({ tenantId: z.uuid() }).safeParse(request.params);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const principal = request.principal!;
    try { requirePermission(principal, permissions.tenantRead); requireTenant(principal, parsed.data.tenantId); }
    catch (error) {
      await dependencies.events.security('AUTHORIZATION_DENIED', 'HIGH', { requestId: requestId(request), tenantId: principal.tenantId, actorId: principal.userId, metadata: { requestedTenantId: parsed.data.tenantId } });
      throw error;
    }
    return { data: { id: principal.tenantId }, requestId: requestId(request) };
  });

  app.post('/api/v1/foundation/idempotent-check', { preHandler: [authenticate, requireJsonContentType] }, async (request, reply) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid Idempotency-Key header is required');
    const principal = request.principal!;
    const scope = { tenantId: principal.tenantId, actorId: principal.userId, action: 'foundation:idempotent-check', keyHash: requestFingerprint(key) };
    const bodyHash = requestFingerprint(request.body ?? null);
    const claim = await dependencies.idempotency.claim(scope, bodyHash);
    if (claim.state === 'conflict') throw new ConflictError('Idempotency key was reused with a different request');
    if (claim.state === 'in_progress') throw new ConflictError('An operation with this idempotency key is already in progress');
    if (claim.state === 'replay') return reply.code(claim.result.status).send(claim.result.body);
    const response = { data: { accepted: true, operationId: crypto.randomUUID() }, requestId: requestId(request) };
    await dependencies.idempotency.complete(scope, { status: 201, body: response, requestHash: bodyHash });
    await dependencies.events.audit('foundation.idempotency.created', 'idempotency_record', scope.keyHash, { requestId: requestId(request), tenantId: principal.tenantId, actorId: principal.userId });
    return reply.code(201).send(response);
  });

  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' }, requestId: requestId(request) }));
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AuthorizationError) { await dependencies.events.security('AUTHORIZATION_DENIED','HIGH',{requestId:request.id,...(request.principal?.tenantId?{tenantId:request.principal.tenantId}:{}),...(request.principal?.userId?{actorId:request.principal.userId}:{}),metadata:{route:request.routeOptions.url}}); return reply.code(403).send({ error: { code: 'FORBIDDEN', message: error.message }, requestId: requestId(request) }); }
    if (error instanceof AuthServiceError) return reply.code(error.status).send({ error: { code: error.code, message: error.message }, requestId: requestId(request) });
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }, requestId: requestId(request) });
    const status = errorStatus(error);
    if (status === 400) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'The request is malformed' }, requestId: requestId(request) });
    if (status === 413) return reply.code(413).send({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request exceeds the allowed size' }, requestId: requestId(request) });
    if (status === 415) return reply.code(415).send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request content type is not supported' }, requestId: requestId(request) });
    if (status === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' }, requestId: requestId(request) });
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, requestId: requestId(request) });
  });
  return app;
}
