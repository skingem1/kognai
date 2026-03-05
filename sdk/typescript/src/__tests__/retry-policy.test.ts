import {createRetryPolicy, calculateDelay, isRetryableError, RETRY_POLICIES, shouldRetry} from '../retry-policy';

describe('retry-policy', () => {
  const defaultPolicy = createRetryPolicy();

  it('createRetryPolicy returns defaults: maxRetries=3, baseDelayMs=1000, maxDelayMs=30000', () => {
    expect(defaultPolicy.maxRetries).toBe(3);
    expect(defaultPolicy.baseDelayMs).toBe(1000);
    expect(defaultPolicy.maxDelayMs).toBe(30000);
  });

  it('createRetryPolicy with overrides sets maxRetries=5 while preserving baseDelayMs=1000', () => {
    const policy = createRetryPolicy({maxRetries: 5});
    expect(policy.maxRetries).toBe(5);
    expect(policy.baseDelayMs).toBe(1000);
  });

  it('calculateDelay at attempt 0 averages between 500ms and 1500ms (base * 0.5 to base * 1.5)', () => {
    const avg = Array.from({length: 20}, () => calculateDelay(0, defaultPolicy))
      .reduce((a, b) => a + b, 0) / 20;
    expect(avg).toBeGreaterThanOrEqual(500);
    expect(avg).toBeLessThanOrEqual(1500);
  });

  it('calculateDelay at attempt 3 caps at maxDelayMs=30000', () => {
    expect(calculateDelay(3, defaultPolicy)).toBeLessThanOrEqual(30000);
  });

  it('calculateDelay increases with attempt: avg at attempt 2 > avg at attempt 0 over 20 runs', () => {
    const avg0 = Array.from({length: 20}, () => calculateDelay(0, defaultPolicy))
      .reduce((a, b) => a + b, 0) / 20;
    const avg2 = Array.from({length: 20}, () => calculateDelay(2, defaultPolicy))
      .reduce((a, b) => a + b, 0) / 20;
    expect(avg2).toBeGreaterThan(avg0);
  });

  it('isRetryableError returns true for HTTP 429 (rate limit)', () => {
    expect(isRetryableError({status: 429}, defaultPolicy)).toBe(true);
  });

  it('isRetryableError returns true for HTTP 503 (service unavailable)', () => {
    expect(isRetryableError({status: 503}, defaultPolicy)).toBe(true);
  });

  it('isRetryableError returns false for HTTP 400 (bad request)', () => {
    expect(isRetryableError({status: 400}, defaultPolicy)).toBe(false);
  });

  it('isRetryableError returns true for ECONNRESET network error code', () => {
    expect(isRetryableError({code: 'ECONNRESET'}, defaultPolicy)).toBe(true);
  });

  it('RETRY_POLICIES.aggressive has maxRetries=5', () => {
    expect(RETRY_POLICIES.aggressive.maxRetries).toBe(5);
  });

  it('RETRY_POLICIES.conservative has maxRetries=2', () => {
    expect(RETRY_POLICIES.conservative.maxRetries).toBe(2);
  });

  it('RETRY_POLICIES.none has maxRetries=0 and shouldRetry returns false', () => {
    expect(RETRY_POLICIES.none.maxRetries).toBe(0);
    expect(shouldRetry(RETRY_POLICIES.none, 0)).toBe(false);
  });
});