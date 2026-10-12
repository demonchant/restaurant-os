import type { Principal } from '@restaurant-os/types';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ApiDependencies } from '../src/contracts.js';
import { authFixture } from './auth-helpers.js';
import { appOptions, testDependencies } from './helpers.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function authApp() {
  const fixture = await authFixture(); const base = testDependencies();
  const dependencies: ApiDependencies = {
    ...base,
    tokenPepper: 'test-session-pepper-at-least-thirty-two',
    authentication: fixture.service,
    sessions: {
      async findByTokenHash(tokenHash): Promise<Principal | null> {
        const session = [...fixture.store.sessions.values()].find((candidate) => candidate.tokenHash === tokenHash);
        if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
        const user = fixture.store.users.get(session.userId);
        if (!user || user.tenantId !== session.tenantId || user.status !== 'ACTIVE') return null;
        return { userId: user.id, tenantId: user.tenantId, sessionId: session.id, kind: user.kind, assuranceLevel: session.assuranceLevel, csrfTokenHash: session.csrfTokenHash, permissions: new Set(),roleCodes:new Set(),locationScope:user.kind==='STAFF'?'TENANT':null,locationIds:new Set() };
      },
    },
  };
  const app = await buildApp(dependencies, appOptions); apps.push(app); return { app, fixture };
}

function sessionCookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const session = values.find((value) => value.startsWith('ros_session='))?.match(/^ros_session=([^;]+)/)?.[1];
  const csrf = values.find((value) => value.startsWith('ros_csrf='))?.match(/^ros_csrf=([^;]+)/)?.[1];
  if (!session || !csrf) throw new Error('Expected session cookies');
  return { session, csrf, header: `ros_session=${session}; ros_csrf=${csrf}` };
}

async function loginCustomer() {
  const result = await authApp();
  const requested = await result.app.inject({ method: 'POST', url: '/api/v1/auth/customer/request-otp', payload: { restaurantSlug: 'pinchichi', phone: '08012345678', channel: 'SMS' } });
  const challengeId = requested.json<{ data: { challengeId: string } }>().data.challengeId;
  const verified = await result.app.inject({ method: 'POST', url: '/api/v1/auth/customer/verify-otp', headers: { cookie: 'ros_session=attacker-fixed-value' }, payload: { challengeId, code: result.fixture.delivery.latest().code } });
  return { ...result, verified, cookies: sessionCookies(verified.headers['set-cookie']) };
}

describe('authentication HTTP boundary', () => {
  it('sets hardened fresh cookies and resolves the authenticated identity', async () => {
    const { app, verified, cookies } = await loginCustomer();
    expect(verified.statusCode).toBe(200);
    expect(cookies.session).not.toBe('attacker-fixed-value');
    const setCookies = verified.headers['set-cookie']; expect(JSON.stringify(setCookies)).toContain('HttpOnly'); expect(JSON.stringify(setCookies)).toContain('SameSite=Strict');
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies.header } });
    expect(me.statusCode).toBe(200); expect(me.json<{ data: { kind: string } }>().data.kind).toBe('CUSTOMER');
  });

  it('requires double-submit CSRF validation for cookie-authenticated state changes', async () => {
    const { app, cookies } = await loginCustomer();
    const denied = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: cookies.header }, payload: {} });
    expect(denied.statusCode).toBe(403); expect(denied.json<{ error: { code: string } }>().error.code).toBe('CSRF_VALIDATION_FAILED');
    const allowed = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: cookies.header, 'x-csrf-token': cookies.csrf }, payload: {} });
    expect(allowed.statusCode).toBe(200);
    const replay = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies.header } });
    expect(replay.statusCode).toBe(401);
  });

  it('does not let customers cross the staff boundary', async () => {
    const { app, cookies } = await loginCustomer();
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/staff/me', headers: { cookie: cookies.header } });
    expect(response.statusCode).toBe(403);
  });

  it('rejects non-JSON and mass-assignment input', async () => {
    const { app } = await authApp();
    const text = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/request-otp', headers: { 'content-type': 'text/plain' }, payload: '{}' });
    expect(text.statusCode).toBe(415);
    const manipulated = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/request-otp', payload: { restaurantSlug: 'pinchichi', phone: '08012345678', channel: 'SMS', tenantId: '22222222-2222-4222-8222-222222222222' } });
    expect(manipulated.statusCode).toBe(400);
    const invalidPhone = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/request-otp', payload: { restaurantSlug: 'pinchichi', phone: 'not-a-phone', channel: 'SMS' } });
    expect(invalidPhone.statusCode).toBe(400); expect(invalidPhone.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('invalidates an existing session when the account becomes suspended', async () => {
    const { app, fixture, verified, cookies } = await loginCustomer();
    const userId = verified.json<{ data: { user: { id: string } } }>().data.user.id; const user = fixture.store.users.get(userId); if (!user) throw new Error('User missing');
    user.status = 'SUSPENDED';
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies.header } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects simultaneous bearer and cookie credentials', async () => {
    const { app, cookies } = await loginCustomer();
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies.header, authorization: `Bearer ${cookies.session}` } });
    expect(response.statusCode).toBe(401);
  });
});
