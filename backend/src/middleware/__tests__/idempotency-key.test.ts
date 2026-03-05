import { getIdempotencyKey } from '../idempotency';
import { Request } from 'express';

describe('getIdempotencyKey', () => {
  it('returns string header value when present', () => {
    const req = { headers: { 'idempotency-key': 'test-key-123' } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBe('test-key-123');
  });

  it('returns first element when header is array', () => {
    const req = { headers: { 'idempotency-key': ['key1', 'key2'] } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBe('key1');
  });

  it('returns undefined when header missing', () => {
    const req = { headers: {} } as unknown as Request;
    expect(getIdempotencyKey(req)).toBeUndefined();
  });

  it('returns undefined when header is empty array', () => {
    const req = { headers: { 'idempotency-key': [] } } as unknown as Request;
    expect(getIdempotencyKey(req)).toBeUndefined();
  });
});