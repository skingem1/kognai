import { buildHeaders, parseRetryAfter, extractRateLimitInfo, buildIdempotencyHeader, mergeHeaders } from '../headers';

describe('buildHeaders', () => {
  it('should include Authorization header', () => {
    expect(buildHeaders('sk-key').Authorization).toBe('Bearer sk-key');
  });
  it('should include Content-Type and X-SDK-Version', () => {
    const h = buildHeaders('sk-key');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-SDK-Version']).toBe('1.0.0');
  });
  it('should merge custom headers and override defaults', () => {
    const h = buildHeaders('sk-key', { 'Content-Type': 'text/plain' });
    expect(h['Content-Type']).toBe('text/plain');
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds to milliseconds', () => expect(parseRetryAfter('30')).toBe(30000));
  it('returns 0 for zero', () => expect(parseRetryAfter('0')).toBe(0));
  it('returns null for null', () => expect(parseRetryAfter(null)).toBeNull());
  it('returns null for invalid input', () => expect(parseRetryAfter('invalid')).toBeNull());
  it('returns null for empty string', () => expect(parseRetryAfter('')).toBeNull());
});

describe('extractRateLimitInfo', () => {
  it('returns parsed info with all headers', () => {
    const info = extractRateLimitInfo({ 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '50', 'x-ratelimit-reset': '1609459200' });
    expect(info?.limit).toBe(100);
    expect(info?.remaining).toBe(50);
    expect(info?.resetAt).toBeInstanceOf(Date);
  });
  it('returns null when x-ratelimit-limit is missing', () => {
    expect(extractRateLimitInfo({ 'x-ratelimit-remaining': '50', 'x-ratelimit-reset': '1609459200' })).toBeNull();
  });
  it('returns null when x-ratelimit-remaining is missing', () => {
    expect(extractRateLimitInfo({ 'x-ratelimit-limit': '100', 'x-ratelimit-reset': '1609459200' })).toBeNull();
  });
  it('returns null when x-ratelimit-reset is missing', () => {
    expect(extractRateLimitInfo({ 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '50' })).toBeNull();
  });
});

describe('buildIdempotencyHeader', () => {
  it('returns header with key', () => expect(buildIdempotencyHeader('idem_123')).toEqual({ 'Idempotency-Key': 'idem_123' }));
  it('returns empty object when no key', () => expect(buildIdempotencyHeader()).toEqual({}));
  it('returns empty object for undefined', () => expect(buildIdempotencyHeader(undefined)).toEqual({}));
});

describe('mergeHeaders', () => {
  it('merges multiple objects', () => expect(mergeHeaders({ A: '1' }, { B: '2' })).toEqual({ A: '1', B: '2' }));
  it('later values override', () => expect(mergeHeaders({ A: '1' }, { A: '2' })).toEqual({ A: '2' }));
  it('returns empty for no args', () => expect(mergeHeaders()).toEqual({}));
  it('merges three objects', () => expect(mergeHeaders({ A: '1' }, { B: '2' }, { C: '3' })).toEqual({ A: '1', B: '2', C: '3' }));
});