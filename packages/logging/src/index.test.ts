import { describe, expect, it } from 'vitest';
import { createLogger } from './index.js';

describe('structured log redaction', () => {
  it('redacts authentication headers and nested credential fields', () => {
    const lines: string[] = [];
    const logger = createLogger('test', 'test', 'info', { write(value) { lines.push(value); } });
    logger.info({ req: { headers: { authorization: 'Bearer secret-token' }, body: { otp: '123456', password: 'secret-password' } }, credentials: { apiKey: 'secret-key' } }, 'security test');
    const output = lines.join('');
    expect(output).not.toContain('secret-token'); expect(output).not.toContain('123456'); expect(output).not.toContain('secret-password'); expect(output).not.toContain('secret-key');
    expect(output).toContain('[REDACTED]');
  });
});
