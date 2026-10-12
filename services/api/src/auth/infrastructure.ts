import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { AuthRateLimiter, OtpDeliveryMessage, OtpDeliveryProvider } from './contracts.js';

export class UnavailableOtpDeliveryProvider implements OtpDeliveryProvider {
  deliver(): Promise<void> { return Promise.reject(new Error('OTP delivery provider is not configured')); }
}

export class WebhookOtpDeliveryProvider implements OtpDeliveryProvider {
  constructor(private readonly url: string, private readonly secret: string) {}
  async deliver(message: OtpDeliveryMessage): Promise<void> {
    const body = JSON.stringify({ challengeId: message.challengeId, tenantId: message.tenantId, phone: message.phone, channel: message.channel, code: message.code, expiresAt: message.expiresAt.toISOString() });
    const timestamp = Date.now().toString(); const signature = createHmac('sha256', this.secret).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-restaurant-os-timestamp': timestamp, 'x-restaurant-os-signature': `sha256=${signature}`, 'x-request-id': message.requestId }, body, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`OTP delivery failed with status ${response.status}`);
  }
}

const rateScript = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return value
`;

export class RedisAuthRateLimiter implements AuthRateLimiter {
  constructor(private readonly redis: Redis, private readonly pepper: string) {}
  async consume(bucket: string, subject: string, limit: number, windowMs: number): Promise<boolean> {
    const subjectHash = createHmac('sha256', this.pepper).update(subject).digest('hex');
    const value = await this.redis.eval(rateScript, 1, `auth-rate:${bucket}:${subjectHash}`, windowMs.toString());
    return typeof value === 'number' && value <= limit;
  }
}
