import { decryptSecret, generateOtp, hashPassword, hashVerificationValue, IdentityValidationError, normalizeEmail, normalizePhone, validatePassword, verifyHashedValue, verifyPassword, verifyTotp, type CountryCode } from '@restaurant-os/auth';
import { createOpaqueToken, hashToken } from '@restaurant-os/security';
import type { AuthRequestContext, AuthServiceDependencies, AuthenticationController, IdentityUser, NewSession, OtpChannel, OtpPurpose, SessionGrant, StaffLoginResult } from './contracts.js';

export class AuthServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); this.name = 'AuthServiceError'; }
}

const invalidVerification = (): AuthServiceError => new AuthServiceError(400, 'INVALID_OR_EXPIRED_VERIFICATION', 'The verification could not be completed');
const invalidCredentials = (): AuthServiceError => new AuthServiceError(401, 'INVALID_CREDENTIALS', 'The credentials are invalid');
const waitForMinimumDuration = async (startedAt: number, durationMs: number): Promise<void> => {
  const remaining = durationMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => { setTimeout(resolve, remaining); });
};

export class AuthenticationService implements AuthenticationController {
  constructor(private readonly dependencies: AuthServiceDependencies) {}

  private phone(value: string): string {
    try { return normalizePhone(value, this.dependencies.defaultCountry as CountryCode); }
    catch (error) { if (error instanceof IdentityValidationError) throw new AuthServiceError(400, 'VALIDATION_ERROR', 'Request validation failed'); throw error; }
  }

  private email(value: string): string {
    try { return normalizeEmail(value); }
    catch (error) { if (error instanceof IdentityValidationError) throw new AuthServiceError(400, 'VALIDATION_ERROR', 'Request validation failed'); throw error; }
  }

  private async passwordHash(value: string): Promise<string> {
    try { return await hashPassword(value); }
    catch (error) { if (error instanceof IdentityValidationError) throw new AuthServiceError(400, 'PASSWORD_POLICY_FAILED', 'The password does not meet the security policy'); throw error; }
  }

  private assertPasswordPolicy(value: string): void {
    try { validatePassword(value); }
    catch (error) { if (error instanceof IdentityValidationError) throw new AuthServiceError(400, 'PASSWORD_POLICY_FAILED', 'The password does not meet the security policy'); throw error; }
  }

  private async tenant(slug: string) {
    const tenant = await this.dependencies.store.findTenantBySlug(slug.trim().toLowerCase());
    if (!tenant || tenant.status !== 'ACTIVE') throw new AuthServiceError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant was not found');
    return tenant;
  }

  private async rate(bucket: string, subject: string, limit: number, windowMs: number): Promise<void> {
    if (!(await this.dependencies.limiter.consume(bucket, subject, limit, windowMs))) throw new AuthServiceError(429, 'RATE_LIMITED', 'Too many attempts; try again later');
  }

  private async requestOtp(input: { tenantId: string; userId: string | null; phone: string; channel: OtpChannel; purpose: OtpPurpose }, context: AuthRequestContext) {
    await this.rate(`otp-request-ip:${input.purpose}`, context.ip, 10, 15 * 60_000);
    await this.rate(`otp-request-target:${input.purpose}`, input.phone, 3, 15 * 60_000);
    const recent = await this.dependencies.store.findRecentOtp(input.tenantId, input.phone, input.purpose);
    const now = new Date(); if (recent && recent.resendAfter > now) throw new AuthServiceError(429, 'OTP_RESEND_TOO_SOON', 'Please wait before requesting another code');
    const code = generateOtp(); const expiresAt = new Date(now.getTime() + 5 * 60_000); const resendAfter = new Date(now.getTime() + 60_000);
    const challengeId = await this.dependencies.store.createOtp({ tenantId: input.tenantId, userId: input.userId, purpose: input.purpose, targetPhone: input.phone, channel: input.channel, codeHash: hashVerificationValue(code, this.dependencies.otpPepper), maxAttempts: 5, expiresAt, resendAfter });
    try { await this.dependencies.delivery.deliver({ challengeId, tenantId: input.tenantId, phone: input.phone, channel: input.channel, code, expiresAt, requestId: context.requestId }); await this.dependencies.store.setOtpDeliveryStatus(challengeId, 'SENT'); }
    catch { await this.dependencies.store.setOtpDeliveryStatus(challengeId, 'FAILED'); await this.dependencies.events.security('OTP_DELIVERY_FAILED', 'MEDIUM', { requestId: context.requestId, tenantId: input.tenantId, ...(input.userId ? { actorId: input.userId } : {}), metadata: { challengeId, purpose: input.purpose, channel: input.channel } }); throw new AuthServiceError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Verification delivery is temporarily unavailable'); }
    await this.dependencies.events.audit('auth.otp.requested', 'otp_challenge', challengeId, { requestId: context.requestId, tenantId: input.tenantId, ...(input.userId ? { actorId: input.userId } : {}), metadata: { purpose: input.purpose, channel: input.channel } });
    return { challengeId, expiresAt, resendAfter };
  }

  private async consumeOtp(challengeId: string, code: string, expectedPurpose: OtpPurpose, context: AuthRequestContext) {
    await this.rate(`otp-verify-ip:${expectedPurpose}`, context.ip, 20, 15 * 60_000); await this.rate('otp-verify-challenge', challengeId, 6, 15 * 60_000);
    const challenge = await this.dependencies.store.getOtp(challengeId); const now = new Date();
    if (!challenge || challenge.purpose !== expectedPurpose || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= challenge.maxAttempts) throw invalidVerification();
    if (!verifyHashedValue(code, challenge.codeHash, this.dependencies.otpPepper)) {
      const remaining = await this.dependencies.store.recordOtpFailure(challenge.id, now);
      await this.dependencies.events.security(remaining === 0 ? 'OTP_BRUTE_FORCE_BLOCKED' : 'OTP_VERIFICATION_FAILED', remaining === 0 ? 'HIGH' : 'MEDIUM', { requestId: context.requestId, tenantId: challenge.tenantId, ...(challenge.userId ? { actorId: challenge.userId } : {}), metadata: { challengeId: challenge.id, purpose: challenge.purpose } });
      throw invalidVerification();
    }
    const consumed = await this.dependencies.store.consumeOtp(challenge.id, now); if (!consumed) throw invalidVerification();
    return consumed;
  }

  private async issueSession(user: IdentityUser, context: AuthRequestContext, assuranceLevel: number): Promise<SessionGrant> {
    const sessionToken = createOpaqueToken(); const csrfToken = createOpaqueToken(); const sessionId = crypto.randomUUID();
    const privileged = user.mfaRequired || assuranceLevel > 1; const ttl = privileged ? this.dependencies.privilegedSessionTtlSeconds : this.dependencies.sessionTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000); const userAgent = context.userAgent ?? 'Unknown device';
    const session: NewSession = { id: sessionId, tenantId: user.tenantId, userId: user.id, tokenHash: hashToken(sessionToken, this.dependencies.sessionPepper), csrfTokenHash: hashToken(csrfToken, this.dependencies.sessionPepper), expiresAt, authMethod: assuranceLevel > 1 ? 'PASSWORD_MFA' : user.kind === 'CUSTOMER' ? 'OTP' : 'PASSWORD', assuranceLevel, deviceLabel: userAgent.slice(0, 120), userAgentHash: hashVerificationValue(userAgent, this.dependencies.sessionPepper), ipHash: hashVerificationValue(context.ip, this.dependencies.sessionPepper) };
    await this.dependencies.store.createSession(session);
    await this.dependencies.events.audit('auth.login.succeeded', 'session', sessionId, { requestId: context.requestId, tenantId: user.tenantId, actorId: user.id, metadata: { method: session.authMethod, assuranceLevel } });
    return { sessionId, sessionToken, csrfToken, expiresAt, user: { id: user.id, tenantId: user.tenantId, kind: user.kind } };
  }

  async requestCustomerOtp(input: { restaurantSlug: string; phone: string; channel: OtpChannel }, context: AuthRequestContext) {
    const tenant = await this.tenant(input.restaurantSlug); const phone = this.phone(input.phone);
    return this.requestOtp({ tenantId: tenant.id, userId: null, phone, channel: input.channel, purpose: 'CUSTOMER_LOGIN' }, context);
  }

  async verifyCustomerOtp(input: { challengeId: string; code: string }, context: AuthRequestContext): Promise<SessionGrant> {
    const challenge = await this.consumeOtp(input.challengeId, input.code, 'CUSTOMER_LOGIN', context);
    const user = await this.dependencies.store.findOrCreateCustomer(challenge.tenantId, challenge.targetPhone, new Date());
    if (user.kind !== 'CUSTOMER' || user.status !== 'ACTIVE') throw new AuthServiceError(403, 'ACCOUNT_UNAVAILABLE', 'The account is unavailable');
    await this.dependencies.events.audit('auth.otp.verified', 'otp_challenge', challenge.id, { requestId: context.requestId, tenantId: user.tenantId, actorId: user.id, metadata: { purpose: challenge.purpose } });
    return this.issueSession(user, context, 1);
  }

  async loginStaff(input: { restaurantSlug: string; email: string; password: string }, context: AuthRequestContext): Promise<StaffLoginResult> {
    const tenant = await this.tenant(input.restaurantSlug); const email = this.email(input.email);
    await this.rate('staff-login-ip', context.ip, 20, 15 * 60_000); await this.rate('staff-login-account', `${tenant.id}:${email}`, 8, 15 * 60_000);
    const user = await this.dependencies.store.findStaffByEmail(tenant.id, email); const valid = await verifyPassword(user?.passwordHash ?? this.dependencies.dummyPasswordHash, input.password);
    if (!user || !valid || user.kind !== 'STAFF' || user.status !== 'ACTIVE') {
      await this.dependencies.events.security('STAFF_LOGIN_FAILED', 'MEDIUM', { requestId: context.requestId, tenantId: tenant.id, ...(user?.id ? { actorId: user.id } : {}) }); throw invalidCredentials();
    }
    if (user.mfaRequired) {
      if (!(await this.dependencies.store.getVerifiedMfaFactor(user.tenantId, user.id))) throw new AuthServiceError(403, 'MFA_SETUP_REQUIRED', 'Privileged authentication requires an enrolled factor');
      const expiresAt = new Date(Date.now() + 5 * 60_000); const challengeId = await this.dependencies.store.createMfaChallenge(user.tenantId, user.id, expiresAt);
      return { mfaRequired: true, challengeId, expiresAt };
    }
    return { mfaRequired: false, grant: await this.issueSession(user, context, 1) };
  }

  async verifyStaffMfa(input: { challengeId: string; code: string }, context: AuthRequestContext): Promise<SessionGrant> {
    await this.rate('mfa-verify-ip', context.ip, 15, 15 * 60_000); await this.rate('mfa-verify-challenge', input.challengeId, 6, 15 * 60_000);
    const challenge = await this.dependencies.store.getMfaChallenge(input.challengeId); const now = new Date();
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= challenge.maxAttempts) throw invalidVerification();
    const factor = await this.dependencies.store.getVerifiedMfaFactor(challenge.tenantId, challenge.userId);
    const valid = factor && verifyTotp(decryptSecret(factor, this.dependencies.mfaEncryptionKey), input.code);
    if (!valid) { const remaining = await this.dependencies.store.recordMfaFailure(challenge.id, now); await this.dependencies.events.security(remaining === 0 ? 'MFA_BRUTE_FORCE_BLOCKED' : 'MFA_VERIFICATION_FAILED', 'HIGH', { requestId: context.requestId, tenantId: challenge.tenantId, actorId: challenge.userId }); throw invalidVerification(); }
    if (!(await this.dependencies.store.consumeMfaChallenge(challenge.id, now))) throw invalidVerification();
    const user = await this.dependencies.store.findUserById(challenge.tenantId, challenge.userId); if (!user || user.status !== 'ACTIVE') throw invalidCredentials();
    return this.issueSession(user, context, 2);
  }

  async requestPhoneChange(input: { tenantId: string; userId: string; newPhone: string; channel: OtpChannel }, context: AuthRequestContext) {
    const user = await this.dependencies.store.findUserById(input.tenantId, input.userId); if (!user || user.kind !== 'CUSTOMER' || user.status !== 'ACTIVE') throw new AuthServiceError(403, 'FORBIDDEN', 'The operation is not permitted');
    const phone = this.phone(input.newPhone);
    return this.requestOtp({ tenantId: user.tenantId, userId: user.id, phone, channel: input.channel, purpose: 'PHONE_CHANGE' }, context);
  }

  async verifyPhoneChange(input: { challengeId: string; code: string; tenantId: string; userId: string; sessionId: string }, context: AuthRequestContext): Promise<void> {
    const challenge = await this.consumeOtp(input.challengeId, input.code, 'PHONE_CHANGE', context);
    if (challenge.tenantId !== input.tenantId || challenge.userId !== input.userId) throw invalidVerification();
    await this.dependencies.store.updateCustomerPhoneAndRevokeOthers(input.tenantId, input.userId, challenge.targetPhone, input.sessionId, new Date());
    await this.dependencies.events.audit('auth.phone.changed', 'user', input.userId, { requestId: context.requestId, tenantId: input.tenantId, actorId: input.userId });
  }

  async requestPasswordReset(input: { restaurantSlug: string; email: string; channel: OtpChannel }, context: AuthRequestContext) {
    const startedAt = Date.now(); const tenant = await this.tenant(input.restaurantSlug); const email = this.email(input.email); await this.rate('password-reset-ip', context.ip, 10, 30 * 60_000); await this.rate('password-reset-account', `${tenant.id}:${email}`, 3, 30 * 60_000);
    const user = await this.dependencies.store.findStaffByEmail(tenant.id, email);
    if (!user?.phone) { const now = Date.now(); await waitForMinimumDuration(startedAt, 300); return { challengeId: crypto.randomUUID(), expiresAt: new Date(now + 5 * 60_000), resendAfter: new Date(now + 60_000) }; }
    const result = await this.requestOtp({ tenantId: tenant.id, userId: user.id, phone: user.phone, channel: input.channel, purpose: 'PASSWORD_RESET' }, context);
    await waitForMinimumDuration(startedAt, 300); return result;
  }

  async resetPassword(input: { challengeId: string; code: string; newPassword: string }, context: AuthRequestContext): Promise<void> {
    this.assertPasswordPolicy(input.newPassword); const challenge = await this.consumeOtp(input.challengeId, input.code, 'PASSWORD_RESET', context); if (!challenge.userId) throw invalidVerification();
    const passwordHash = await this.passwordHash(input.newPassword); await this.dependencies.store.updatePasswordAndRevokeSessions(challenge.tenantId, challenge.userId, passwordHash, new Date());
    await this.dependencies.events.audit('auth.password.reset', 'user', challenge.userId, { requestId: context.requestId, tenantId: challenge.tenantId, actorId: challenge.userId });
  }

  async revokeSession(input: { tenantId: string; userId: string; sessionId: string }, context: AuthRequestContext): Promise<boolean> {
    const revoked = await this.dependencies.store.revokeSession(input.tenantId, input.userId, input.sessionId, new Date());
    if (revoked) await this.dependencies.events.audit('auth.session.revoked', 'session', input.sessionId, { requestId: context.requestId, tenantId: input.tenantId, actorId: input.userId }); return revoked;
  }
  async logoutAll(input: { tenantId: string; userId: string }, context: AuthRequestContext): Promise<number> {
    const count = await this.dependencies.store.revokeAllSessions(input.tenantId, input.userId, new Date()); await this.dependencies.events.audit('auth.sessions.revoked_all', 'user', input.userId, { requestId: context.requestId, tenantId: input.tenantId, actorId: input.userId, metadata: { count } }); return count;
  }
  async listSessions(input: { tenantId: string; userId: string; currentSessionId: string }) { return (await this.dependencies.store.listSessions(input.tenantId, input.userId, new Date())).map((session) => ({ ...session, current: session.id === input.currentSessionId })); }
}
