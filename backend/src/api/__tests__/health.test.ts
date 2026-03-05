import { getHealth, getHealthHandler, HealthStatus } from '../health';
import { Request, Response } from 'express';

describe('getHealth', () => {
  it('returns health status with all required fields', () => {
    const health = getHealth();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('version');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('services');
  });

  it('returns status healthy when both services are up', () => {
    const health = getHealth();
    expect(health.status).toBe('healthy');
    expect(health.services.database).toBe('up');
    expect(health.services.cache).toBe('up');
  });

  it('uses default version 1.0.0', () => {
    delete process.env.APP_VERSION;
    const health = getHealth();
    expect(health.version).toBe('1.0.0');
  });

  it('uses APP_VERSION env var when set', () => {
    process.env.APP_VERSION = '2.0.0';
    const health = getHealth();
    expect(health.version).toBe('2.0.0');
    delete process.env.APP_VERSION;
  });

  it('returns non-negative uptime and valid ISO timestamp', () => {
    const health = getHealth();
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
  });
});

describe('getHealthHandler', () => {
  it('returns 200 with health status for healthy', () => {
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const req = {} as Request;
    getHealthHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'healthy',
      version: expect.any(String),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
      services: expect.objectContaining({ database: 'up', cache: 'up' }),
    }));
  });
});