import type { EventSink } from '../contracts.js';

export type OtpChannel = 'SMS' | 'WHATSAPP';
export type OtpPurpose = 'CUSTOMER_LOGIN' | 'PHONE_CHANGE' | 'PASSWORD_RESET';

export interface TenantIdentity { id: string; slug: string; status: string; }
export interface IdentityUser {
  id: string; tenantId: string; kind: 'CUSTOMER' | 'STAFF'; status: string; phone: string | null; email: string | null;
  passwordHash: string | null; mfaRequired: boolean;
}
export interface OtpRecord {
  id: string; tenantId: string; userId: string | null; purpose: OtpPurpose; targetPhone: string; channel: OtpChannel;
  codeHash: string; attempts: number; maxAttempts: number; expiresAt: Date; resendAfter: Date; consumedAt: Date | null;
}
export interface MfaChallengeRecord { id: string; tenantId: string; userId: string; attempts: number; maxAttempts: number; expiresAt: Date; consumedAt: Date | null; }
export interface MfaFactorRecord { ciphertext: string; iv: string; tag: string; }
export interface SessionRecord { id: string; deviceLabel: string | null; lastSeenAt: Date; createdAt: Date; expiresAt: Date; revokedAt: Date | null; }

export interface NewSession {
  id: string; tenantId: string; userId: string; tokenHash: string; csrfTokenHash: string; expiresAt: Date;
  authMethod: string; assuranceLevel: number; deviceLabel: string; userAgentHash: string; ipHash: string;
}

export interface AuthStore {
  findTenantBySlug(slug: string): Promise<TenantIdentity | null>;
  findRecentOtp(tenantId: string, targetPhone: string, purpose: OtpPurpose): Promise<Pick<OtpRecord, 'resendAfter'> | null>;
  createOtp(input: Omit<OtpRecord, 'id' | 'attempts' | 'consumedAt'>): Promise<string>;
  setOtpDeliveryStatus(id: string, status: 'SENT' | 'FAILED'): Promise<void>;
  getOtp(id: string): Promise<OtpRecord | null>;
  recordOtpFailure(id: string, now: Date): Promise<number | null>;
  consumeOtp(id: string, now: Date): Promise<OtpRecord | null>;
  findOrCreateCustomer(tenantId: string, phone: string, now: Date): Promise<IdentityUser>;
  findStaffByEmail(tenantId: string, email: string): Promise<IdentityUser | null>;
  findUserById(tenantId: string, userId: string): Promise<IdentityUser | null>;
  createSession(input: NewSession): Promise<void>;
  revokeSession(tenantId: string, userId: string, sessionId: string, now: Date): Promise<boolean>;
  revokeOtherSessions(tenantId: string, userId: string, currentSessionId: string, now: Date): Promise<number>;
  revokeAllSessions(tenantId: string, userId: string, now: Date): Promise<number>;
  listSessions(tenantId: string, userId: string, now: Date): Promise<SessionRecord[]>;
  updateCustomerPhoneAndRevokeOthers(tenantId: string, userId: string, phone: string, currentSessionId: string, now: Date): Promise<void>;
  updatePasswordAndRevokeSessions(tenantId: string, userId: string, passwordHash: string, now: Date): Promise<void>;
  createMfaChallenge(tenantId: string, userId: string, expiresAt: Date): Promise<string>;
  getMfaChallenge(id: string): Promise<MfaChallengeRecord | null>;
  recordMfaFailure(id: string, now: Date): Promise<number | null>;
  consumeMfaChallenge(id: string, now: Date): Promise<MfaChallengeRecord | null>;
  getVerifiedMfaFactor(tenantId: string, userId: string): Promise<MfaFactorRecord | null>;
}

export interface OtpDeliveryMessage { challengeId: string; tenantId: string; phone: string; channel: OtpChannel; code: string; expiresAt: Date; requestId: string; }
export interface OtpDeliveryProvider { deliver(message: OtpDeliveryMessage): Promise<void>; }
export interface AuthRateLimiter { consume(bucket: string, subject: string, limit: number, windowMs: number): Promise<boolean>; }

export interface AuthRequestContext { requestId: string; ip: string; userAgent?: string; }
export interface SessionGrant { sessionId: string; sessionToken: string; csrfToken: string; expiresAt: Date; user: { id: string; tenantId: string; kind: string }; }
export type StaffLoginResult = { mfaRequired: true; challengeId: string; expiresAt: Date } | { mfaRequired: false; grant: SessionGrant };

export interface AuthenticationController {
  requestCustomerOtp(input: { restaurantSlug: string; phone: string; channel: OtpChannel }, context: AuthRequestContext): Promise<{ challengeId: string; expiresAt: Date; resendAfter: Date }>;
  verifyCustomerOtp(input: { challengeId: string; code: string }, context: AuthRequestContext): Promise<SessionGrant>;
  loginStaff(input: { restaurantSlug: string; email: string; password: string }, context: AuthRequestContext): Promise<StaffLoginResult>;
  verifyStaffMfa(input: { challengeId: string; code: string }, context: AuthRequestContext): Promise<SessionGrant>;
  requestPhoneChange(input: { tenantId: string; userId: string; newPhone: string; channel: OtpChannel }, context: AuthRequestContext): Promise<{ challengeId: string; expiresAt: Date; resendAfter: Date }>;
  verifyPhoneChange(input: { challengeId: string; code: string; tenantId: string; userId: string; sessionId: string }, context: AuthRequestContext): Promise<void>;
  requestPasswordReset(input: { restaurantSlug: string; email: string; channel: OtpChannel }, context: AuthRequestContext): Promise<{ challengeId: string; expiresAt: Date; resendAfter: Date }>;
  resetPassword(input: { challengeId: string; code: string; newPassword: string }, context: AuthRequestContext): Promise<void>;
  revokeSession(input: { tenantId: string; userId: string; sessionId: string }, context: AuthRequestContext): Promise<boolean>;
  logoutAll(input: { tenantId: string; userId: string }, context: AuthRequestContext): Promise<number>;
  listSessions(input: { tenantId: string; userId: string; currentSessionId: string }): Promise<(SessionRecord & { current: boolean })[]>;
}

export interface AuthServiceDependencies {
  store: AuthStore; delivery: OtpDeliveryProvider; limiter: AuthRateLimiter; events: EventSink;
  otpPepper: string; sessionPepper: string; mfaEncryptionKey: string; defaultCountry: string; dummyPasswordHash: string;
  sessionTtlSeconds: number; privilegedSessionTtlSeconds: number;
}
