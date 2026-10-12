import { describe, expect, it } from 'vitest';
import { createTotpCode, createTotpSecret, decryptSecret, encryptSecret, generateOtp, hashPassword, hashVerificationValue, normalizeEmail, normalizePhone, verifyHashedValue, verifyPassword, verifyTotp } from './index.js';

describe('identity cryptography', () => {
  it('normalizes international phone numbers and email', () => { expect(normalizePhone('0801 234 5678', 'NG')).toBe('+2348012345678'); expect(normalizeEmail(' Staff@Example.COM ')).toBe('staff@example.com'); });
  it('rejects invalid phone numbers', () => expect(() => normalizePhone('123', 'NG')).toThrow());
  it('generates bounded numeric OTPs and verifies only their HMAC', () => { const otp = generateOtp(); const hash = hashVerificationValue(otp, 'pepper'); expect(otp).toMatch(/^\d{6}$/); expect(hash).not.toContain(otp); expect(verifyHashedValue(otp, hash, 'pepper')).toBe(true); expect(verifyHashedValue('000000', hash, 'pepper')).toBe(false); });
  it('uses Argon2id password hashing', async () => { const hash = await hashPassword('correct horse battery 7!'); expect(hash).toContain('$argon2id$'); await expect(verifyPassword(hash, 'correct horse battery 7!')).resolves.toBe(true); await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false); });
  it('encrypts MFA secrets with authenticated encryption', () => { const key = Buffer.alloc(32, 7).toString('base64'); const secret = createTotpSecret(); const encrypted = encryptSecret(secret, key); expect(encrypted.ciphertext).not.toContain(secret); expect(decryptSecret(encrypted, key)).toBe(secret); });
  it('accepts a current TOTP and rejects an incorrect factor', () => { const secret = createTotpSecret(); const now = 1_800_000_000_000; expect(verifyTotp(secret, createTotpCode(secret, now), now)).toBe(true); expect(verifyTotp(secret, '000000', now)).toBe(false); });
});
