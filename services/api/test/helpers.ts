import { hashToken } from '@restaurant-os/security';
import type { Principal } from '@restaurant-os/types';
import type { ApiDependencies, IdempotencyResult, IdempotencyScope } from '../src/contracts.js';
import type { AuthenticationController } from '../src/auth/contracts.js';
import type { StaffController } from '../src/staff/contracts.js';
import type { OrganizationController } from '../src/organization/contracts.js';

export const ids = {
  tenantA: '11111111-1111-4111-8111-111111111111', tenantB: '22222222-2222-4222-8222-222222222222',
  owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', customer: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ownerB: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

export function testDependencies(): ApiDependencies & { securityEvents: string[]; audits: string[]; auditContexts: { action: string; resourceType: string; resourceId?: string; requestId: string; tenantId?: string; actorId?: string }[] } {
  const pepper = 'test-pepper-that-is-at-least-32-characters';
  const principals = new Map<string, Principal>([
    [hashToken('owner-token', pepper), { userId: ids.owner, tenantId: ids.tenantA, sessionId: 's1', kind: 'STAFF', assuranceLevel: 1, permissions: new Set(['tenant:read', 'system:configure']),roleCodes:new Set(['OWNER']),locationScope:'TENANT',locationIds:new Set() }],
    [hashToken('customer-token', pepper), { userId: ids.customer, tenantId: ids.tenantA, sessionId: 's2', kind: 'CUSTOMER', assuranceLevel: 1, permissions: new Set(),roleCodes:new Set(),locationScope:null,locationIds:new Set() }],
    [hashToken('owner-b-token', pepper), { userId: ids.ownerB, tenantId: ids.tenantB, sessionId: 's3', kind: 'STAFF', assuranceLevel: 1, permissions: new Set(['tenant:read']),roleCodes:new Set(['OWNER']),locationScope:'TENANT',locationIds:new Set() }],
  ]);
  const records = new Map<string, IdempotencyResult>(); const securityEvents: string[] = []; const audits: string[] = []; const auditContexts: { action: string; resourceType: string; resourceId?: string; requestId: string; tenantId?: string; actorId?: string }[] = [];
  const scopeKey = (scope: IdempotencyScope): string => Object.values(scope).join(':');
  return {
    tokenPepper: pepper, cookie: { secure: false }, authentication: unsupportedAuthentication(),staff:unsupportedStaff(),organization:unsupportedOrganization(), securityEvents, audits, auditContexts,
    sessions: { findByTokenHash(hash) { return Promise.resolve(principals.get(hash) ?? null); } },
    readiness: { check() { return Promise.resolve(); } },
    events: {
      audit(action, resourceType, resourceId, context) { audits.push(action); auditContexts.push({ action, resourceType, ...(resourceId ? { resourceId } : {}), requestId: context.requestId, ...(context.tenantId ? { tenantId: context.tenantId } : {}), ...(context.actorId ? { actorId: context.actorId } : {}) }); return Promise.resolve(); },
      security(eventType: string) { securityEvents.push(eventType); return Promise.resolve(); },
    },
    idempotency: {
      claim(scope, requestHash) {
        const existing = records.get(scopeKey(scope));
        if (!existing) { records.set(scopeKey(scope), { status: 0, body: null, requestHash }); return Promise.resolve({ state: 'acquired' as const }); }
        if (existing.requestHash !== requestHash) return Promise.resolve({ state: 'conflict' as const });
        if (existing.status === 0) return Promise.resolve({ state: 'in_progress' as const });
        return Promise.resolve({ state: 'replay' as const, result: existing });
      },
      complete(scope, result) { const existing = records.get(scopeKey(scope)); if (!existing || existing.status !== 0 || existing.requestHash !== result.requestHash) return Promise.reject(new Error('Invalid claim completion')); records.set(scopeKey(scope), result); return Promise.resolve(); },
    },
  };
}

function unsupportedStaff():StaffController{const unavailable=()=>Promise.reject(new Error('Staff controller is not configured for this test'));return{list:unavailable,get:unavailable,roles:unavailable,permissions:unavailable,invite:unavailable,revokeInvitation:unavailable,acceptInvitation:unavailable,completeInvitationMfa:unavailable,beginMfaEnrollment:unavailable,completeMfaEnrollment:unavailable,update:unavailable,suspend:unavailable,reactivate:unavailable,assignRole:unavailable,removeRole:unavailable,sessions:unavailable,revokeSession:unavailable,revokeAllSessions:unavailable};}

function unsupportedOrganization():OrganizationController{const unavailable=()=>Promise.reject(new Error('Organization controller is not configured for this test'));return{restaurant:unavailable,updateRestaurant:unavailable,locations:unavailable,location:unavailable,createLocation:unavailable,updateLocation:unavailable,staffLocations:unavailable,assignStaffLocation:unavailable,removeStaffLocation:unavailable,devices:unavailable,device:unavailable,createDevice:unavailable,updateDevice:unavailable,revokeDevice:unavailable,rotateDevice:unavailable,enrollDevice:unavailable,completeRotation:unavailable,heartbeat:unavailable};}

function unsupportedAuthentication(): AuthenticationController {
  const unavailable = () => Promise.reject(new Error('Authentication controller is not configured for this test'));
  return {
    requestCustomerOtp: unavailable, verifyCustomerOtp: unavailable, loginStaff: unavailable, verifyStaffMfa: unavailable,
    requestPhoneChange: unavailable, verifyPhoneChange: unavailable, requestPasswordReset: unavailable, resetPassword: unavailable,
    revokeSession: unavailable, logoutAll: unavailable, listSessions: unavailable,
  };
}

export const appOptions = { logger: false as const, corsOrigins: ['http://localhost:3000'], rateLimitMax: 100, rateLimitWindowMs: 60_000 };
