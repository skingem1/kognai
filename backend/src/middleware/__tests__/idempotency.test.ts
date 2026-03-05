import { Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware, getIdempotencyKey } from '../idempotency';

describe('getIdempotencyKey', () => {
  it('returns string header value', () => {
    const req = { headers: { 'idempotency-key': 'abc-123' } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBe('abc-123');
  });

  it('returns first element of array header', () => {
    const req = { headers: { 'idempotency-key': ['first', 'second'] } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBe('first');
  });

  it('returns undefined for missing header', () => {
    const req = { headers: {} } as unknown as Request;
    expect(getIdempotencyKey(req)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    const req = { headers: { 'idempotency-key': [] } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBeUndefined();
  });
});

describe('idempotencyMiddleware', () => {
  const createMockRes = () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    return { json: mockJson, status: mockStatus, statusCode: 200 } as unknown as Response;
  };

  it('calls next() immediately when no idempotency key', () => {
    const req = { headers: {} } as Request;
    const res = createMockRes();
    const next = jest.fn();
    const middleware = idempotencyMiddleware();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('caches response on miss, returns cached on hit without calling next', () => {
    const middleware = idempotencyMiddleware();
    const req1 = { headers: { 'idempotency-key': 'key-1' } } as Request;
    const res1 = createMockRes();
    const next1 = jest.fn();
    middleware(req1, res1, next1);
    res1.json!({ data: 'test' });
    expect(next1).toHaveBeenCalled();

    const req2 = { headers: { 'idempotency-key': 'key-1' } } as Request;
    const res2 = createMockRes();
    const next2 = jest.fn();
    middleware(req2, res2, next2);
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(res2.json).toHaveBeenCalledWith({ data: 'test' });
    expect(next2).not.toHaveBeenCalled();
  });

  it('different keys are independent', () => {
    const middleware = idempotencyMiddleware();
    const reqA = { headers: { 'idempotency-key': 'key-a' } } as Request;
    const resA = createMockRes();
    const nextA = jest.fn();
    middleware(reqA, resA, nextA);
    resA.json!({ key: 'a' });
    expect(nextA).toHaveBeenCalled();

    const reqB = { headers: { 'idempotency-key': 'key-b' } } as Request;
    const resB = createMockRes();
    const nextB = jest.fn();
    middleware(reqB, resB, nextB);
    resB.json!({ key: 'b' });
    expect(nextB).toHaveBeenCalled();
  });

  it('cleans up expired entries older than 24h', () => {
    const middleware = idempotencyMiddleware();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const req1 = { headers: { 'idempotency-key': 'old-key' } } as Request;
    const res1 = createMockRes();
    middleware(req1, res1, jest.fn());
    res1.json!({ old: true });

    jest.spyOn(Date, 'now').mockImplementation(() => now + 25 * 60 * 60 * 1000);
    const req2 = { headers: { 'idempotency-key': 'old-key' } } as Request;
    const res2 = createMockRes();
    const next2 = jest.fn();
    middleware(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
    expect(res2.json).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});