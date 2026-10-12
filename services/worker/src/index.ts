import { loadConfig } from '@restaurant-os/config'; import { createLogger } from '@restaurant-os/logging'; import { Redis } from 'ioredis';
const config = loadConfig(process.env); const logger = createLogger('worker', config.APP_ENV, config.LOG_LEVEL); const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
await redis.connect(); logger.info('Worker coordination connection established; no business queues are registered in Phase 0');
const shutdown = (signal: string): void => { logger.info({ signal }, 'Worker shutting down'); redis.disconnect(); process.exitCode = 0; };
process.once('SIGINT', () => shutdown('SIGINT')); process.once('SIGTERM', () => shutdown('SIGTERM'));
