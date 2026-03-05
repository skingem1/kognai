import { CountableError, RateLimitError, InvoicaError } from '../src/error-compat';

describe('error-compat', () => {
  it('CountableError is InvoicaError', () => {
    expect(CountableError).toBe(InvoicaError);
  });

  it('RateLimitError extends InvoicaError', () => {
    const err = new RateLimitError('Too many requests', 30);
    expect(err).toBeInstanceOf(InvoicaError);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryAfter).toBe(30);
  });

  it('RateLimitError defaults retryAfter to 0', () => {
    const err = new RateLimitError('Rate limited');
    expect(err.retryAfter).toBe(0);
    expect(err.message).toBe('Rate limited');
  });

  it('CountableError instances are also InvoicaError instances', () => {
    const err = new CountableError('test', 500, 'TEST');
    expect(err).toBeInstanceOf(InvoicaError);
    expect(err.statusCode).toBe(500);
  });
});