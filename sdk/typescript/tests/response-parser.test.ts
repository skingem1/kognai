import { isApiError, parseResponse } from '../src/response-parser';
import { InvoicaError, ValidationError, AuthenticationError, NotFoundError } from '../src/errors';
import { CountableError, RateLimitError } from '../src/error-compat';

const mockResponse = (status: number, body: object, ok?: boolean): Response =>
  ({ ok: ok ?? (status >= 200 && status < 300), status, statusText: 'Error', json: async () => body }) as any;

describe('response-parser', () => {
  describe('isApiError', () => {
    it('returns true for InvoicaError instances', () => expect(isApiError(new InvoicaError('test'))).toBe(true));
    it('returns false for plain Error', () => expect(isApiError(new Error('test'))).toBe(false));
    it('returns false for null/undefined/primitives', () => {
      expect(isApiError(null)).toBe(false);
      expect(isApiError(undefined)).toBe(false);
      expect(isApiError('str')).toBe(false);
    });
  });

  describe('parseResponse', () => {
    it('returns data on success', async () => {
      const res = mockResponse(200, { success: true, data: { name: 'test' } });
      expect(await parseResponse(res)).toEqual({ name: 'test' });
    });

    it('throws ValidationError for 400', async () => {
      const res = mockResponse(400, { success: false, error: { message: 'Invalid', code: 'E001' } });
      await expect(parseResponse(res)).rejects.toThrow(ValidationError);
    });

    it('throws AuthenticationError for 401', async () => {
      const res = mockResponse(401, { success: false, error: { message: 'Unauthorized', code: 'E002' } });
      await expect(parseResponse(res)).rejects.toThrow(AuthenticationError);
    });

    it('throws NotFoundError for 404', async () => {
      const res = mockResponse(404, { success: false, error: { message: 'Not found', code: 'E003' } });
      await expect(parseResponse(res)).rejects.toThrow(NotFoundError);
    });

    it('throws RateLimitError for 429', async () => {
      const res = mockResponse(429, { success: false, error: { message: 'Rate limited', code: 'E004' } });
      await expect(parseResponse(res)).rejects.toThrow(RateLimitError);
    });

    it('throws CountableError for 500', async () => {
      const res = mockResponse(500, { success: false, error: { message: 'Server error', code: 'E005' } });
      await expect(parseResponse(res)).rejects.toThrow(CountableError);
    });

    it('throws CountableError when success=false', async () => {
      const res = mockResponse(200, { success: false });
      await expect(parseResponse(res)).rejects.toThrow('Response missing data');
    });

    it('throws CountableError on JSON parse failure', async () => {
      const res = { ok: true, status: 200, statusText: 'OK', json: async () => { throw new Error('parse fail'); } } as any;
      await expect(parseResponse(res)).rejects.toThrow('Failed to parse response');
    });
  });
});