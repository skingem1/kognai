import { isApiError, parseResponse } from '../src/response-parser-v2';
import { InvoicaError, ValidationError, AuthenticationError, NotFoundError } from '../src/errors';
import { RateLimitError } from '../src/error-compat';

const mockResponse = (status: number, body: object, ok?: boolean): Response => {
  return { ok: ok ?? (status >= 200 && status < 300), status, statusText: 'Error', json: async () => body } as unknown as Response;
};

describe('isApiError', () => {
  it('returns true for InvoicaError', () => {
    expect(isApiError(new InvoicaError('test', 500, 'ERR'))).toBe(true);
  });
  it('returns true for ValidationError', () => expect(isApiError(new ValidationError('bad'))).toBe(true));
  it('returns true for NotFoundError', () => expect(isApiError(new NotFoundError('nope'))).toBe(true));
  it('returns true for RateLimitError', () => expect(isApiError(new RateLimitError('slow'))).toBe(true));
  it('returns false for plain Error', () => expect(isApiError(new Error('plain'))).toBe(false));
  it('returns false for primitives', () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
    expect(isApiError('str')).toBe(false);
    expect(isApiError(123)).toBe(false);
  });
});

describe('parseResponse', () => {
  it('returns data when ok and success', async () => {
    const res = mockResponse(200, { success: true, data: { id: 1 } });
    expect(await parseResponse<{ id: number }>(res)).toEqual({ id: 1 });
  });
  it('throws ValidationError on 400', async () => {
    const res = mockResponse(400, { success: false, error: { message: 'Bad', code: 'BAD' } }, false);
    await expect(parseResponse(res)).rejects.toThrow(ValidationError);
  });
  it('throws AuthenticationError on 401', async () => {
    const res = mockResponse(401, { success: false, error: { message: 'Auth', code: 'AUTH' } }, false);
    await expect(parseResponse(res)).rejects.toThrow(AuthenticationError);
  });
  it('throws NotFoundError on 404', async () => {
    const res = mockResponse(404, { success: false, error: { message: 'Not found', code: 'NOT_FOUND' } }, false);
    await expect(parseResponse(res)).rejects.toThrow(NotFoundError);
  });
  it('throws RateLimitError on 429', async () => {
    const res = mockResponse(429, { success: false, error: { message: 'Slow', code: 'RATE_LIMIT' } }, false);
    await expect(parseResponse(res)).rejects.toThrow(RateLimitError);
  });
  it('throws InvoicaError on 500', async () => {
    const res = mockResponse(500, { success: false, error: { message: 'Server', code: 'ERR' } }, false);
    await expect(parseResponse(res)).rejects.toThrow(InvoicaError);
  });
  it('throws when response missing data', async () => {
    const res = mockResponse(200, { success: true });
    await expect(parseResponse(res)).rejects.toThrow('Response missing data');
  });
  it('throws when json parse fails', async () => {
    const res = { ok: true, status: 200, statusText: 'OK', json: async () => { throw new Error('fail'); } } as unknown as Response;
    await expect(parseResponse(res)).rejects.toThrow('Failed to parse response');
  });
});