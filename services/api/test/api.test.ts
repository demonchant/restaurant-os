import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { appOptions, ids, testDependencies } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('API foundation', () => {
  it('reports process health and request ID', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200); expect(response.headers['x-request-id']).toBeTruthy();
  });
  it('generates authoritative request IDs instead of trusting forged correlation headers', async () => {
    app = await buildApp(testDependencies(), appOptions); const forged = '00000000-0000-4000-8000-000000000000';
    const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': forged } });
    expect(response.headers['x-request-id']).not.toBe(forged); expect(response.json<{ requestId: string }>().requestId).toBe(response.headers['x-request-id']);
  });
  it('returns safe readiness failures', async () => {
    const dependencies = testDependencies(); dependencies.readiness.check = () => Promise.reject(new Error('postgresql://secret'));
    app = await buildApp(dependencies, appOptions); const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503); expect(response.body).not.toContain('postgresql');
  });
  it('returns the authenticated principal without session material', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: '/api/v1/session/me', headers: { authorization: 'Bearer owner-token' } });
    expect(response.statusCode).toBe(200); expect(response.body).not.toContain('owner-token');
  });
  it('rejects malformed parameters', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/not-a-uuid', headers: { authorization: 'Bearer owner-token' } });
    expect(response.statusCode).toBe(400); expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });
  it('replays the original idempotent response and rejects key mutation', async () => {
    app = await buildApp(testDependencies(), appOptions); const headers = { authorization: 'Bearer owner-token', 'idempotency-key': '1234567890abcdef', 'content-type': 'application/json' };
    const first = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 1 } });
    const replay = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 1 } });
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 2 } });
    expect(replay.json()).toEqual(first.json()); expect(conflict.statusCode).toBe(409);
  });
  it('atomically claims concurrent duplicates so only one operation executes', async () => {
    app = await buildApp(testDependencies(), appOptions); const headers = { authorization: 'Bearer owner-token', 'idempotency-key': 'concurrent-key-0001', 'content-type': 'application/json' };
    const [left, right] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 1 } }),
      app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 1 } }),
    ]);
    expect([201, 409]).toContain(left.statusCode); expect([201, 409]).toContain(right.statusCode); expect([left.statusCode, right.statusCode]).toContain(201);
    const completed = left.statusCode === 201 ? left : right;
    if (left.statusCode === 201 && right.statusCode === 201) expect(left.json()).toEqual(right.json());
    const replay = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers, payload: { value: 1 } });
    expect(replay.statusCode).toBe(201); expect(replay.json()).toEqual(completed.json());
  });
  it('scopes the same idempotency key independently by actor and tenant', async () => {
    app = await buildApp(testDependencies(), appOptions); const base = { 'idempotency-key': 'shared-scope-key01', 'content-type': 'application/json' };
    const owner = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { ...base, authorization: 'Bearer owner-token' }, payload: { value: 1 } });
    const customer = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { ...base, authorization: 'Bearer customer-token' }, payload: { value: 1 } });
    const tenantB = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { ...base, authorization: 'Bearer owner-b-token' }, payload: { value: 1 } });
    const operationIds = [owner, customer, tenantB].map((response) => response.json<{ data: { operationId: string } }>().data.operationId);
    expect(new Set(operationIds).size).toBe(3);
  });
  it('attributes sensitive audit events to actor, tenant, resource type, and server request ID', async () => {
    const dependencies = testDependencies(); app = await buildApp(dependencies, appOptions);
    const response = await app.inject({ method: 'POST', url: '/api/v1/foundation/idempotent-check', headers: { authorization: 'Bearer owner-token', 'idempotency-key': 'audit-attribution1', 'content-type': 'application/json' }, payload: { value: 1 } });
    const event = dependencies.auditContexts[0];
    expect(event).toMatchObject({ action: 'foundation.idempotency.created', resourceType: 'idempotency_record', actorId: ids.owner, tenantId: ids.tenantA, requestId: response.headers['x-request-id'] }); expect(event?.resourceId).toMatch(/^[a-f0-9]{64}$/);
  });
  it('accepts only its configured CORS origin', async () => {
    app = await buildApp(testDependencies(), appOptions);
    const response = await app.inject({ method: 'OPTIONS', url: '/health', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'GET' } });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('allows tenant owner to read their own tenant foundation', async () => {
    app = await buildApp(testDependencies(), appOptions); const response = await app.inject({ method: 'GET', url: `/api/v1/tenants/${ids.tenantA}`, headers: { authorization: 'Bearer owner-token' } });
    expect(response.statusCode).toBe(200);
  });
});
