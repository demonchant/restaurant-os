import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { appOptions, ids, testDependencies } from './helpers.js';

let app: FastifyInstance | undefined; afterEach(async () => app?.close());

describe('adversarial security checks', () => {
  it('rejects unauthenticated protected access', async () => {
    app = await buildApp(testDependencies(), appOptions); expect((await app.inject({ method: 'GET', url: '/api/v1/session/me' })).statusCode).toBe(401);
  });
  it('rejects an invalid or expired/revoked session', async () => {
    const dependencies = testDependencies(); app = await buildApp(dependencies, appOptions);
    const response = await app.inject({ method: 'GET', url: '/api/v1/session/me', headers: { authorization: 'Bearer expired-token' } });
    expect(response.statusCode).toBe(401); expect(dependencies.securityEvents).toContain('INVALID_SESSION');
  });
  it('prevents a customer from accessing tenant administration', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: `/api/v1/tenants/${ids.tenantA}`, headers: { authorization: 'Bearer customer-token' } });
    expect(response.statusCode).toBe(403);
  });
  it('prevents Tenant A from accessing Tenant B and emits a security event', async () => {
    const dependencies = testDependencies(); app = await buildApp(dependencies, appOptions);
    const response = await app.inject({ method: 'GET', url: `/api/v1/tenants/${ids.tenantB}`, headers: { authorization: 'Bearer owner-token', 'x-tenant-id': ids.tenantB } });
    expect(response.statusCode).toBe(403); expect(dependencies.securityEvents).toContain('AUTHORIZATION_DENIED');
  });
  it('does not trust forged role or tenant headers', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: `/api/v1/tenants/${ids.tenantA}`, headers: { authorization: 'Bearer customer-token', 'x-role': 'OWNER', 'x-tenant-id': ids.tenantA } });
    expect(response.statusCode).toBe(403);
  });
  it('rejects oversized requests', async () => {
    app = await buildApp(testDependencies(), { ...appOptions, bodyLimit: 64 });
    const response = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { authorization: 'Bearer owner-token', 'idempotency-key': '1234567890abcdef', 'content-type': 'application/json' }, payload: { value: 'x'.repeat(100) } });
    expect(response.statusCode).toBe(413); expect(response.body).not.toContain('FastifyError');
  });
  it('rate limits abusive clients', async () => {
    app = await buildApp(testDependencies(), { ...appOptions, rateLimitMax: 2 });
    await app.inject({ method: 'GET', url: '/health' }); await app.inject({ method: 'GET', url: '/health' });
    const response = await app.inject({ method: 'GET', url: '/health' }); expect(response.statusCode).toBe(429);
  });
  it('does not leak internals for unknown routes', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: '/../../etc/passwd' });
    expect(response.statusCode).toBe(404); expect(response.body).not.toContain('filesystem');
  });
  it('rejects malformed bearer syntax before session lookup', async () => {
    app = await buildApp(testDependencies(), appOptions);
    const response = await app.inject({ method: 'GET', url: '/api/v1/session/me', headers: { authorization: 'Bearer owner-token extra' } });
    expect(response.statusCode).toBe(401);
  });
  it('returns a safe error for unsupported mutation content types', async () => {
    app = await buildApp(testDependencies(), appOptions);
    const response = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { authorization: 'Bearer owner-token', 'idempotency-key': '1234567890abcdef', 'content-type': 'text/plain' }, payload: 'unsafe' });
    expect(response.statusCode).toBe(415); expect(response.json<{ error: { code: string } }>().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
  it('does not allow JSON prototype keys to pollute application objects', async () => {
    app = await buildApp(testDependencies(), appOptions);
    const response = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { authorization: 'Bearer owner-token', 'idempotency-key': 'prototype-test-01', 'content-type': 'application/json' }, payload: '{"__proto__":{"polluted":true}}' });
    expect(response.statusCode).toBe(400); expect(Reflect.get(Object.prototype, 'polluted')).toBeUndefined();
  });
});
