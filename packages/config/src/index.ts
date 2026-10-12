import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const environmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    APP_URL: z.url(),
    API_URL: z.url(),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z.string().startsWith('redis://'),
    SESSION_SECRET: z.string().min(32),
    OTP_PEPPER: z.string().min(32),
    IDENTITY_TOKEN_PEPPER: z.string().min(32),
    DEVICE_CREDENTIAL_PEPPER: z.string().min(32),
    MFA_ENCRYPTION_KEY: z.string().refine((value) => { try { return Buffer.from(value, 'base64').length === 32; } catch { return false; } }, 'Must be a base64-encoded 32-byte key'),
    OTP_DELIVERY_WEBHOOK_URL: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
    OTP_DELIVERY_WEBHOOK_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional()),
    INVITATION_DELIVERY_WEBHOOK_URL: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
    INVITATION_DELIVERY_WEBHOOK_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional()),
    DEFAULT_PHONE_COUNTRY: z.string().regex(/^[A-Z]{2}$/).default('NG'),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(2_592_000).default(604_800),
    PRIVILEGED_SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(604_800).default(28_800),
    COOKIE_DOMAIN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGINS: z.string().transform((value) => value.split(',').map((item) => item.trim())),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    TRUST_PROXY: booleanString.default(false),
  })
  .superRefine((config, context) => {
    if (config.APP_ENV === 'production' && config.SESSION_SECRET.includes('replace-with')) {
      context.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Production secret is insecure' });
    }
    if (config.APP_ENV === 'production' && config.OTP_PEPPER.includes('replace-with')) {
      context.addIssue({ code: 'custom', path: ['OTP_PEPPER'], message: 'Production OTP pepper is insecure' });
    }
    if (config.SESSION_SECRET === config.OTP_PEPPER) {
      context.addIssue({ code: 'custom', path: ['OTP_PEPPER'], message: 'OTP and session secrets must be independent' });
    }
    if ([config.SESSION_SECRET,config.OTP_PEPPER].includes(config.IDENTITY_TOKEN_PEPPER)) context.addIssue({ code: 'custom', path: ['IDENTITY_TOKEN_PEPPER'], message: 'Identity token pepper must be independent' });
    if ([config.SESSION_SECRET,config.OTP_PEPPER,config.IDENTITY_TOKEN_PEPPER].includes(config.DEVICE_CREDENTIAL_PEPPER)) context.addIssue({ code: 'custom', path: ['DEVICE_CREDENTIAL_PEPPER'], message: 'Device credential pepper must be independent' });
    if (config.APP_ENV === 'production' && config.CORS_ORIGINS.some((origin) => origin === '*')) {
      context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Wildcard CORS is forbidden' });
    }
    if (config.APP_ENV === 'production' && (!config.OTP_DELIVERY_WEBHOOK_URL || !config.OTP_DELIVERY_WEBHOOK_SECRET)) {
      context.addIssue({ code: 'custom', path: ['OTP_DELIVERY_WEBHOOK_URL'], message: 'Production OTP delivery configuration is required' });
    }
    if (config.APP_ENV === 'production' && (!config.INVITATION_DELIVERY_WEBHOOK_URL || !config.INVITATION_DELIVERY_WEBHOOK_SECRET)) context.addIssue({ code: 'custom', path: ['INVITATION_DELIVERY_WEBHOOK_URL'], message: 'Production invitation delivery configuration is required' });
    if (config.APP_ENV === 'production' && /^A+$/.test(config.MFA_ENCRYPTION_KEY.replace(/=+$/u, ''))) {
      context.addIssue({ code: 'custom', path: ['MFA_ENCRYPTION_KEY'], message: 'Production MFA encryption key is insecure' });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`Invalid application configuration: ${fields}`);
  }
  return result.data;
}
