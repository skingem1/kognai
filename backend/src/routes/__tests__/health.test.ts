import request from 'supertest';
import express from 'express';
import router from '../health';

const app = express();
app.use('/v1', router);

jest.mock('../lib/prisma');
jest.mock('../lib/redis');

import prisma from '../lib/prisma';
import redis from '../lib/redis';

describe('GET /v1/health', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns 200 with status ok when database is healthy', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);
    (redis.ping as jest.Mock).mockResolvedValue('PONG');
    process.env.REDIS_URL = 'redis://localhost';

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('returns 503 when database is down', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
    (redis.ping as jest.Mock).mockResolvedValue('PONG');
    process.env.REDIS_URL = 'redis://localhost';

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(503);
  });

  test('returns redis not_configured when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL;
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);

    const res = await request(app).get('/v1/health');

    expect(res.body.redis).toBe('not_configured');
  });

  test('returns redis ok when REDIS_URL is set and redis.ping resolves', async () => {
    process.env.REDIS_URL = 'redis://localhost';
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);
    (redis.ping as jest.Mock).mockResolvedValue('PONG');

    const res = await request(app).get('/v1/health');

    expect(res.body.redis).toBe('ok');
  });

  test('includes version, uptime, and timestamp in response body', async () => {
    process.env.REDIS_URL = 'redis://localhost';
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);
    (redis.ping as jest.Mock).mockResolvedValue('PONG');

    const before = Date.now();
    const res = await request(app).get('/v1/health');
    const after = Date.now();

    expect(res.body.version).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(new Date(res.body.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(res.body.timestamp).getTime()).toBeLessThanOrEqual(after);
  });
});
