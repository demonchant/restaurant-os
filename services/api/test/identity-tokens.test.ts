import { describe, expect, it } from 'vitest';
import { OneTimeIdentityTokens, type IdentityTokenRecord, type IdentityTokenStore, type IdentityTokenPurpose } from '../src/auth/identity-tokens.js';

class MemoryTokenStore implements IdentityTokenStore {
  records = new Map<string, IdentityTokenRecord & { tokenHash: string; revokedAt: Date | null }>();

  async create(input: Omit<IdentityTokenRecord, 'id' | 'consumedAt'> & { tokenHash: string }) {
    const id = crypto.randomUUID(); this.records.set(id, { ...input, id, consumedAt: null, revokedAt: null }); return id;
  }

  async consume(tokenHash: string, purpose: IdentityTokenPurpose, now: Date) {
    const record = [...this.records.values()].find((candidate) => candidate.tokenHash === tokenHash && candidate.purpose === purpose);
    if (!record || record.consumedAt || record.revokedAt || record.expiresAt <= now) return null;
    record.consumedAt = now; return record;
  }

  async revoke(id: string, tenantId: string, now: Date) {
    const record = this.records.get(id); if (!record || record.tenantId !== tenantId || record.consumedAt || record.revokedAt) return false;
    record.revokedAt = now; return true;
  }
}

describe('one-time identity tokens', () => {
  it('stores only a hash and permits exactly one concurrent invitation acceptance', async () => {
    const store = new MemoryTokenStore(); const service = new OneTimeIdentityTokens(store, 'identity-token-pepper-at-least-32');
    const issued = await service.issue({ tenantId: 'tenant-a', userId: null, purpose: 'STAFF_INVITATION', target: 'staff@example.com', expiresAt: new Date(Date.now() + 60_000) });
    expect(store.records.get(issued.id)?.tokenHash).not.toBe(issued.token);
    const results = await Promise.all([service.consume(issued.token, 'STAFF_INVITATION'), service.consume(issued.token, 'STAFF_INVITATION')]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rejects expired, revoked, and wrong-purpose tokens', async () => {
    const store = new MemoryTokenStore(); const service = new OneTimeIdentityTokens(store, 'identity-token-pepper-at-least-32');
    const expired = await service.issue({ tenantId: 'tenant-a', userId: null, purpose: 'STAFF_INVITATION', target: null, expiresAt: new Date(Date.now() - 1) });
    expect(await service.consume(expired.token, 'STAFF_INVITATION')).toBeNull();
    const revoked = await service.issue({ tenantId: 'tenant-a', userId: null, purpose: 'STAFF_INVITATION', target: null, expiresAt: new Date(Date.now() + 60_000) });
    expect(await service.revoke(revoked.id, 'tenant-a')).toBe(true);
    expect(await service.consume(revoked.token, 'STAFF_INVITATION')).toBeNull();
    const wrong = await service.issue({ tenantId: 'tenant-a', userId: null, purpose: 'STAFF_INVITATION', target: null, expiresAt: new Date(Date.now() + 60_000) });
    expect(await service.consume(wrong.token, 'ACCOUNT_RECOVERY')).toBeNull();
  });
});
