import { createTotpCode, createTotpSecret, verifyPassword } from '@restaurant-os/auth';
import { describe, expect, it } from 'vitest';
import { AuthServiceError } from '../src/auth/service.js';
import { authContext, authFixture } from './auth-helpers.js';

async function customerChallenge() {
  const fixture = await authFixture();
  const challenge = await fixture.service.requestCustomerOtp(
    { restaurantSlug: 'pinchichi', phone: '0801 234 5678', channel: 'SMS' },
    authContext,
  );
  return { ...fixture, challenge, code: fixture.delivery.latest().code };
}

describe('customer OTP authentication', () => {
  it('normalizes a phone, consumes a valid OTP, and creates a fresh session', async () => {
    const fixture = await customerChallenge();
    expect(fixture.delivery.latest().phone).toBe('+2348012345678');

    const grant = await fixture.service.verifyCustomerOtp(
      { challengeId: fixture.challenge.challengeId, code: fixture.code },
      authContext,
    );

    expect(grant.user.kind).toBe('CUSTOMER');
    expect(grant.sessionToken.length).toBeGreaterThanOrEqual(43);
    expect(fixture.store.sessions.get(grant.sessionId)?.tokenHash).not.toBe(grant.sessionToken);
    expect(fixture.events.audits.map(({ action }) => action)).toContain('auth.otp.verified');
  });

  it('rejects invalid, expired, and replayed OTPs', async () => {
    const invalid = await customerChallenge();
    await expect(invalid.service.verifyCustomerOtp({ challengeId: invalid.challenge.challengeId, code: '000000' }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });

    const expired = await customerChallenge();
    const expiredRecord = expired.store.otps.get(expired.challenge.challengeId);
    if (!expiredRecord) throw new Error('OTP fixture missing');
    expiredRecord.expiresAt = new Date(Date.now() - 1);
    await expect(expired.service.verifyCustomerOtp({ challengeId: expired.challenge.challengeId, code: expired.code }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });

    const replay = await customerChallenge();
    await replay.service.verifyCustomerOtp({ challengeId: replay.challenge.challengeId, code: replay.code }, authContext);
    await expect(replay.service.verifyCustomerOtp({ challengeId: replay.challenge.challengeId, code: replay.code }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });
  });

  it('allows exactly one concurrent consumer', async () => {
    const fixture = await customerChallenge();
    const results = await Promise.allSettled([
      fixture.service.verifyCustomerOtp({ challengeId: fixture.challenge.challengeId, code: fixture.code }, authContext),
      fixture.service.verifyCustomerOtp({ challengeId: fixture.challenge.challengeId, code: fixture.code }, authContext),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('blocks guessing and emits a security event without the OTP', async () => {
    const fixture = await customerChallenge();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(fixture.service.verifyCustomerOtp({ challengeId: fixture.challenge.challengeId, code: '111111' }, authContext)).rejects.toBeInstanceOf(AuthServiceError);
    }
    await expect(fixture.service.verifyCustomerOtp({ challengeId: fixture.challenge.challengeId, code: fixture.code }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });
    expect(fixture.events.securityEvents.at(-1)?.eventType).toBe('OTP_BRUTE_FORCE_BLOCKED');
    expect(JSON.stringify(fixture.events)).not.toContain(fixture.code);
  });

  it('enforces resend and layered request limits', async () => {
    const fixture = await customerChallenge();
    await expect(fixture.service.requestCustomerOtp(
      { restaurantSlug: 'pinchichi', phone: '08012345678', channel: 'WHATSAPP' }, authContext,
    )).rejects.toMatchObject({ code: 'OTP_RESEND_TOO_SOON' });

    const limited = await authFixture();
    for (let index = 0; index < 10; index += 1) {
      const phone = `0801234567${index}`;
      await limited.service.requestCustomerOtp({ restaurantSlug: 'pinchichi', phone, channel: 'SMS' }, authContext);
    }
    await expect(limited.service.requestCustomerOtp(
      { restaurantSlug: 'pinchichi', phone: '08012345680', channel: 'SMS' }, authContext,
    )).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('fails closed when delivery is unavailable', async () => {
    const fixture = await authFixture(); fixture.delivery.fail = true;
    await expect(fixture.service.requestCustomerOtp(
      { restaurantSlug: 'pinchichi', phone: '08012345678', channel: 'SMS' }, authContext,
    )).rejects.toMatchObject({ status: 503, code: 'OTP_DELIVERY_UNAVAILABLE' });
  });
});

describe('staff authentication and recovery', () => {
  it('uses uniform credential errors and creates a staff session', async () => {
    const fixture = await authFixture(); await fixture.addStaff();
    await expect(fixture.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'missing@example.com', password: 'wrong password' }, authContext,
    )).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(fixture.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'staff@example.com', password: 'wrong password' }, authContext,
    )).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const result = await fixture.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'STAFF@example.com', password: 'staff password secure 7!' }, authContext,
    );
    expect(result.mfaRequired).toBe(false);
  });

  it('rejects suspended staff and requires a valid enrolled MFA factor', async () => {
    const suspended = await authFixture(); await suspended.addStaff({ status: 'SUSPENDED' });
    await expect(suspended.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'staff@example.com', password: 'staff password secure 7!' }, authContext,
    )).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const fixture = await authFixture(); const user = await fixture.addStaff({ mfaRequired: true }); const secret = createTotpSecret(); fixture.addMfa(user, secret);
    const login = await fixture.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'staff@example.com', password: 'staff password secure 7!' }, authContext,
    );
    if (!login.mfaRequired) throw new Error('MFA challenge was expected');
    await expect(fixture.service.verifyStaffMfa({ challengeId: login.challengeId, code: '000000' }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });
    const grant = await fixture.service.verifyStaffMfa(
      { challengeId: login.challengeId, code: createTotpCode(secret) }, authContext,
    );
    expect(fixture.store.sessions.get(grant.sessionId)?.assuranceLevel).toBe(2);
  });

  it('resets a password once and revokes every existing session', async () => {
    const fixture = await authFixture(); const user = await fixture.addStaff();
    const oldLogin = await fixture.service.loginStaff(
      { restaurantSlug: 'pinchichi', email: 'staff@example.com', password: 'staff password secure 7!' }, authContext,
    );
    if (oldLogin.mfaRequired) throw new Error('Unexpected MFA challenge');
    const reset = await fixture.service.requestPasswordReset(
      { restaurantSlug: 'pinchichi', email: 'staff@example.com', channel: 'SMS' }, authContext,
    );
    const code = fixture.delivery.latest().code;
    await fixture.service.resetPassword({ challengeId: reset.challengeId, code, newPassword: 'new password secure 8!' }, authContext);
    expect(fixture.store.sessions.get(oldLogin.grant.sessionId)?.revokedAt).toBeInstanceOf(Date);
    expect(await verifyPassword(fixture.store.users.get(user.id)?.passwordHash ?? '', 'new password secure 8!')).toBe(true);
    await expect(fixture.service.resetPassword({ challengeId: reset.challengeId, code, newPassword: 'another password secure 9!' }, authContext))
      .rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_VERIFICATION' });
  });

  it('rejects a weak recovery password with a safe validation error', async () => {
    const fixture = await authFixture(); await fixture.addStaff();
    const reset = await fixture.service.requestPasswordReset({ restaurantSlug: 'pinchichi', email: 'staff@example.com', channel: 'SMS' }, authContext);
    await expect(fixture.service.resetPassword({ challengeId: reset.challengeId, code: fixture.delivery.latest().code, newPassword: 'onlyletterslong' }, authContext))
      .rejects.toMatchObject({ status: 400, code: 'PASSWORD_POLICY_FAILED' });
  });
});

describe('identity state changes', () => {
  it('changes a verified customer phone and revokes other sessions', async () => {
    const fixture = await customerChallenge();
    const first = await fixture.service.verifyCustomerOtp({ challengeId: fixture.challenge.challengeId, code: fixture.code }, authContext);
    const user = fixture.store.users.get(first.user.id); if (!user) throw new Error('User missing');
    const second = await fixture.service.requestCustomerOtp({ restaurantSlug: 'pinchichi', phone: user.phone ?? '', channel: 'SMS' }, { ...authContext, ip: '127.0.0.2' });
    const secondGrant = await fixture.service.verifyCustomerOtp({ challengeId: second.challengeId, code: fixture.delivery.latest().code }, { ...authContext, ip: '127.0.0.2' });
    const change = await fixture.service.requestPhoneChange(
      { tenantId: user.tenantId, userId: user.id, newPhone: '08099999999', channel: 'WHATSAPP' },
      { ...authContext, ip: '127.0.0.3' },
    );
    await fixture.service.verifyPhoneChange(
      { challengeId: change.challengeId, code: fixture.delivery.latest().code, tenantId: user.tenantId, userId: user.id, sessionId: first.sessionId },
      { ...authContext, ip: '127.0.0.3' },
    );
    expect(user.phone).toBe('+2348099999999');
    expect(fixture.store.sessions.get(first.sessionId)?.revokedAt).toBeNull();
    expect(fixture.store.sessions.get(secondGrant.sessionId)?.revokedAt).toBeInstanceOf(Date);
  });
});
