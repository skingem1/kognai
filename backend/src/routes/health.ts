import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const router = Router();

router.get('/v1/health', async (_req: Request, res: Response) => {
  const services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error' | 'not_configured';
  } = {
    database: 'error',
    redis: 'not_configured',
  };

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = 'ok';
  } catch {
    services.database = 'error';
  }

  // Check Redis connectivity if REDIS_URL is configured
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      await redis.ping();
      services.redis = 'ok';
    } catch {
      services.redis = 'error';
    }
  }

  const status: 'ok' | 'error' = services.database === 'ok' ? 'ok' : 'error';
  const statusCode = services.database === 'ok' ? 200 : 503;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { version } = require('../../package.json');

  res.status(statusCode).json({
    status,
    version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services,
  });
});

export default router;