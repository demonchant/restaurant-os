import { describe, expect, it } from 'vitest';
import { authorize, AuthorizationError, maximumRoleRank, permissions, requireAssurance } from './index.js';
const principal = { userId: 'u1', tenantId: 't1', sessionId: 's1', kind: 'STAFF' as const, assuranceLevel: 2, permissions: new Set([permissions.staffView]), roleCodes: new Set(['ADMIN']), locationScope: 'LOCATIONS' as const, locationIds: new Set(['l1']) };
describe('authorization', () => {
  it('requires permission and tenant together', () => { expect(() => authorize(principal, permissions.staffView, { tenantId: 't1' })).not.toThrow(); expect(() => authorize(principal, permissions.staffUpdate, { tenantId: 't1' })).toThrow(AuthorizationError); expect(() => authorize(principal, permissions.staffView, { tenantId: 't2' })).toThrow(AuthorizationError); });
  it('enforces resource location scope', () => { expect(() => authorize(principal, permissions.staffView, { tenantId: 't1', locationId: 'l1' })).not.toThrow(); expect(() => authorize(principal, permissions.staffView, { tenantId: 't1', locationId: 'l2' })).toThrow(AuthorizationError); });
  it('enforces authentication assurance and role ranks', () => { expect(() => requireAssurance(principal, 2)).not.toThrow(); expect(() => requireAssurance({ ...principal, assuranceLevel: 1 }, 2)).toThrow(); expect(maximumRoleRank(principal.roleCodes)).toBe(80); });
});
