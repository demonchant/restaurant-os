import { describe, expect, it } from 'vitest';
import { loadConfig } from './index.js';

const valid = {
  APP_ENV: 'test', APP_URL: 'http://localhost:3000', API_URL: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://user:pass@localhost/db', REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'a-secure-test-secret-that-is-long-enough', CORS_ORIGINS: 'http://localhost:3000',
  OTP_PEPPER: 'a-secure-test-otp-pepper-long-enough', MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  IDENTITY_TOKEN_PEPPER: 'independent-identity-token-pepper-test', DEVICE_CREDENTIAL_PEPPER: 'independent-device-credential-pepper-test',
  OTP_DELIVERY_WEBHOOK_URL: 'https://delivery.test.invalid/otp', OTP_DELIVERY_WEBHOOK_SECRET: 'test-webhook-secret-that-is-long-enough',
  INVITATION_DELIVERY_WEBHOOK_URL: 'https://delivery.test.invalid/invitation', INVITATION_DELIVERY_WEBHOOK_SECRET: 'test-invitation-secret-that-is-long-enough',
};

describe('loadConfig', () => {
  it('rejects missing secrets without printing their values', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
  });
  it('rejects wildcard production CORS', () => {
    expect(() => loadConfig({ ...valid, APP_ENV: 'production', CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
  });
  it('requires independent OTP and session secrets', () => {
    expect(() => loadConfig({ ...valid, OTP_PEPPER: valid.SESSION_SECRET })).toThrow('OTP_PEPPER');
  });
});
