import pino, { type DestinationStream, type Logger } from 'pino';

const redact = [
  'req.headers.authorization', 'req.headers.cookie', 'headers.authorization', 'password', 'otp', 'token',
  'sessionToken', 'apiKey', '*.password', '*.otp', '*.token', '*.sessionToken', '*.apiKey',
  'req.body.password', 'req.body.otp', 'req.body.token', 'req.body.sessionToken', 'req.body.apiKey',
  'body.password', 'body.otp', 'body.token', 'body.sessionToken', 'body.apiKey',
  'credentials.password', 'credentials.otp', 'credentials.token', 'credentials.apiKey',
];

export function createLogger(service: string, environment: string, level: string, destination?: DestinationStream): Logger {
  const options = { level, base: { service, environment }, redact: { paths: redact, censor: '[REDACTED]' } };
  return destination ? pino(options, destination) : pino(options);
}
