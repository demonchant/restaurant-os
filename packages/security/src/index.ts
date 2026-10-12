import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOpaqueToken(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }
export function hashToken(token: string, pepper: string): string { return createHash('sha256').update(`${pepper}:${token}`).digest('hex'); }
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function requestFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
