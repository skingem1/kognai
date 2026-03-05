import { createRateLimiter, RateLimiterConfig } from '../rate-limiter';
import { Request, Response, NextFunction } from 'express';

const mockReqRes = (apiKey?: string) => {
  const req = { headers: apiKey ? { 'x-api-key': apiKey } : {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
};

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
    const { req, res, next } = mockReqRes('test-key');
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
  });

  it('sets rate limit headers on response', () => {
    const limiter = createRateLimiter({ maxRequests: 10 });
    const { req, res, next } = mockReqRes('header-key');
    limiter(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
  });

  it('returns 429 when limit exceeded', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    for (let i = 0; i < 3; i++) {
      const { req, res, next } = mockReqRes('flood-key');
      limiter(req, res, next);
      if (i === 2) {
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'rate_limit_exceeded' }));
      }
    }
  });

  it('uses IP address when no API key provided', () => {
    const limiter = createRateLimiter({ maxRequests: 100 });
    const { req, res, next } = mockReqRes();
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses default config when no options provided', () => {
    const limiter = createRateLimiter();
    const { req, res, next } = mockReqRes('default-key');
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
  });
});