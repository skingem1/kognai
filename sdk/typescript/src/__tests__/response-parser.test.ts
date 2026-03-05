import { isApiError, parseResponse } from '../response-parser';
import { CountableError, AuthenticationError, NotFoundError, RateLimitError, ValidationError } from '../errors';

const mockResponse = (body: unknown, status = 200) => 
  new Response(JSON.stringify(body), { status, statusText: 'OK', headers: { 'Content-Type': 'application/json' } });

describe('isApiError', () => {
  it('returns true for CountableError', () => expect(isApiError(new CountableError('msg', 'CODE'))).toBe(true));
  it('returns false for plain Error', () => expect(isApiError(new Error('msg'))).toBe(false));
  it('returns false for non-errors', () => { expect(isApiError(null)).toBe(false); expect(isApiError('str')).toBe(false); });
});

describe('parseResponse', () => {
  it('returns data on success', async () => {
    const res = mockResponse({ success: true, data: { id: '123' } });
    expect(await parseResponse(res)).toEqual({ id: '123' });
  });

  it('throws PARSE_ERROR for invalid JSON', async () => {
    const res = new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } });
    await expect(parseResponse(res)).rejects.toThrow('Failed to parse response');
  });

  it('throws specific errors for 400/401/404/429', async () => {
    await expect(parseResponse(mockResponse({}, 400))).rejects.toBeInstanceOf(ValidationError);
    await expect(parseResponse(mockResponse({}, 401))).rejects.toBeInstanceOf(AuthenticationError);
    await expect(parseResponse(mockResponse({}, 404))).rejects.toBeInstanceOf(NotFoundError);
    await expect(parseResponse(mockResponse({}, 429))).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws CountableError for 500', async () => {
    await expect(parseResponse(mockResponse({}, 500))).rejects.toBeInstanceOf(CountableError);
  });

  it('throws INVALID_RESPONSE when success false or data undefined', async () => {
    await expect(parseResponse(mockResponse({ success: false }))).rejects.toThrow('INVALID_RESPONSE');
    await expect(parseResponse(mockResponse({ success: true, data: undefined }))).rejects.toThrow('INVALID_RESPONSE');
  });
});