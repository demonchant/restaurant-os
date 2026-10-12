import argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
export type { CountryCode } from 'libphonenumber-js/max';

export class IdentityValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'IdentityValidationError'; }
}

export function normalizePhone(input: string, defaultCountry: CountryCode): string {
  const phone = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!phone?.isValid()) throw new IdentityValidationError('Phone number is invalid');
  return phone.number;
}

export function normalizeEmail(input: string): string {
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new IdentityValidationError('Email address is invalid');
  return value;
}

export function generateOtp(length = 6): string {
  if (!Number.isInteger(length) || length < 6 || length > 10) throw new IdentityValidationError('OTP length is unsupported');
  return randomInt(0, 10 ** length).toString().padStart(length, '0');
}

export function hashVerificationValue(value: string, pepper: string): string {
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
}

export function verifyHashedValue(value: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashVerificationValue(value, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const passwordPolicy = { minimumLength: 12, maximumLength: 128 } as const;

export function validatePassword(password: string): void {
  if (password.length < passwordPolicy.minimumLength || password.length > passwordPolicy.maximumLength) {
    throw new IdentityValidationError(`Password must be ${passwordPolicy.minimumLength}-${passwordPolicy.maximumLength} characters`);
  }
  if (!/[A-Za-z]/.test(password) || !/[^A-Za-z]/.test(password)) throw new IdentityValidationError('Password must contain varied character classes');
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try { return await argon2.verify(hash, password); } catch { return false; }
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(input: Buffer): string {
  let bits = 0; let value = 0; let output = '';
  for (const byte of input) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += base32Alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string): Buffer {
  let bits = 0; let value = 0; const output: number[] = [];
  for (const character of input.replace(/=+$/u, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(character); if (index < 0) throw new IdentityValidationError('MFA secret is invalid');
    value = (value << 5) | index; bits += 5; if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

export function createTotpSecret(): string { return base32Encode(randomBytes(20)); }

function totpAt(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  const value = ((digest[offset]! & 127) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return (value % 1_000_000).toString().padStart(6, '0');
}
export function createTotpCode(secret: string, now = Date.now()): string { return totpAt(secret, Math.floor(now / 30_000)); }

export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = Buffer.from(totpAt(secret, counter + offset)); const supplied = Buffer.from(code);
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) return true;
  }
  return false;
}

export interface EncryptedSecret { ciphertext: string; iv: string; tag: string; }
function encryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64'); if (key.length !== 32) throw new IdentityValidationError('MFA encryption key must be 32 bytes'); return key;
}
export function encryptSecret(secret: string, encodedKey: string): EncryptedSecret {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptSecret(value: EncryptedSecret, encodedKey: string): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encodedKey), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
