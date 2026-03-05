import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, RateLimiterConfig } from '../rate-limiter';

const mockReq = (opts: { auth?: string; apiKey?: string; ip?: string } = {}): Partial<Request> => ({
  headers: { authorization: opts.auth, 'x-api-key': opts.apiKey },
  ip: opts.ip || '127.0.0.1'
});

const mockRes = (): Partial<Response> => {
  const res: any = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('createRateLimiter', () => {
  let nextFn: NextFunction;

  beforeEach(() => { nextFn = jest.fn(); });

  it('allows requests under limit with Bearer token', () => {
    const rateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    const req = mockReq({ auth: 'Bearer test-key' }) as Request;
    const res = mockRes() as Response;
    rateLimiter(req, res, nextFn);
    expect(nextFn).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 2);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 1);
  });

  it('returns 429 when limit exceeded', () => {
    const rateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req = mockReq({ auth: 'Bearer key1' }) as Request;
    const res = mockRes() as Response;
    rateLimiter(req, res, nextFn);
    rateLimiter(req, res, nextFn);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'rate_limit_exceeded', retryAfter: expect.any(Number) });
  });

  it('uses x-api-key header when present', () => {
    const rateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req = mockReq({ apiKey: 'api-key-123' }) as Request;
    const res = mockRes() as Response;
    rateLimiter(req, res, nextFn);
    rateLimiter(req, res, nextFn);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('falls back to IP when no API key provided', () => {
    const rateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req = mockReq({ ip: '10.0.0.1' }) as Request;
    const res = mockRes() as Response;
    rateLimiter(req, res, nextFn);
    rateLimiter(req, res, nextFn);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('applies default config when none provided', () => {
    const rateLimiter = createRateLimiter();
    const req = mockReq({ auth: 'Bearer key' }) as Request;
    const res = mockRes() as Response;
    rateLimiter(req, res, nextFn);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
  });
});