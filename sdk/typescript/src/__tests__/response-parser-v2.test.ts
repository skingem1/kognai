import { InvoicaError, AuthenticationError, NotFoundError, ValidationError } from '../errors';
import { RateLimitError } from '../error-compat';
import { isApiError, parseResponse } from '../response-parser-v2';

const mockResponse = (body: object, status = 200, ok = true): Response => ({
  json: jest.fn().mockResolvedValue(body),
  ok,
  status,
  statusText: 'Error',
} as unknown as Response);

describe('isApiError', () => {
  it('returns true for InvoicaError', () => {
    expect(isApiError(new InvoicaError('msg', 500, 'CODE'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isApiError(new Error('msg'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isApiError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isApiError(undefined)).toBe(false);
  });
});

describe('parseResponse', () => {
  it('returns data on success', async () => {
    const res = mockResponse({ success: true, data: { id: 1 } });
    const result = await parseResponse(res);
    expect(result).toEqual({ id: 1 });
  });

  it('throws ValidationError on 400', async () => {
    const res = mockResponse({ success: false }, 400, false);
    await expect(parseResponse(res)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws AuthenticationError on 401', async () => {
    const res = mockResponse({ success: false }, 401, false);
    await expect(parseResponse(res)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('throws NotFoundError on 404', async () => {
    const res = mockResponse({ success: false }, 404, false);
    await expect(parseResponse(res)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws RateLimitError on 429', async () => {
    const res = mockResponse({ success: false }, 429, false);
    await expect(parseResponse(res)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws InvoicaError on 500', async () => {
    const res = mockResponse({ success: false }, 500, false);
    await expect(parseResponse(res)).rejects.toBeInstanceOf(InvoicaError);
  });

  it('throws PARSE_ERROR on unparseable JSON', async () => {
    const res = { json: jest.fn().mockRejectedValue(new Error('parse fail')), ok: true, status: 200 } as unknown as Response;
    const err = await parseResponse(res).catch(e => e);
    expect(err.code).toBe('PARSE_ERROR');
  });

  it('throws INVALID_RESPONSE when success is false', async () => {
    const res = mockResponse({ success: false }, 200, true);
    const err = await parseResponse(res).catch(e => e);
    expect(err.code).toBe('INVALID_RESPONSE');
  });

  it('throws INVALID_RESPONSE when data is undefined', async () => {
    const res = mockResponse({ success: true }, 200, true);
    const err = await parseResponse(res).catch(e => e);
    expect(err.code).toBe('INVALID_RESPONSE');
  });
});