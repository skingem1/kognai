import { CountableError, RateLimitError, InvoicaError } from '../error-compat';

describe('error-compat', () => {
  it('CountableError is same reference as InvoicaError', () => {
    expect(CountableError).toBe(InvoicaError);
  });

  it('InvoicaError re-export works', () => {
    const error = new InvoicaError('test', 500, 'TEST_CODE');
    expect(error.message).toBe('test');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TEST_CODE');
  });

  it('new CountableError works like InvoicaError', () => {
    const error = new CountableError('message', 400, 'BAD_REQUEST');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('message');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('RateLimitError has statusCode 429 and code RATE_LIMIT', () => {
    const error = new RateLimitError('rate limited');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.name).toBe('RateLimitError');
  });

  it('RateLimitError with retryAfter sets retryAfter correctly', () => {
    const error = new RateLimitError('rate limited', 30);
    expect(error.retryAfter).toBe(30);
  });

  it('RateLimitError without retryAfter defaults to 0', () => {
    const error = new RateLimitError('rate limited');
    expect(error.retryAfter).toBe(0);
  });

  it('RateLimitError is instanceof InvoicaError and instanceof Error', () => {
    const error = new RateLimitError('rate limited');
    expect(error).toBeInstanceOf(InvoicaError);
    expect(error).toBeInstanceOf(Error);
  });
});