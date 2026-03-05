import { isOriginAllowed, getCorsHeaders, DEFAULT_CORS_OPTIONS, CorsOptions } from '../cors-config';

describe('cors-config', () => {
  describe('isOriginAllowed', () => {
    it('returns true when origin is in allowedOrigins', () => {
      expect(isOriginAllowed('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
    });

    it('returns true when allowedOrigins includes wildcard', () => {
      expect(isOriginAllowed('http://evil.com', ['*'])).toBe(true);
    });

    it('returns false when origin not in allowedOrigins', () => {
      expect(isOriginAllowed('http://evil.com', ['http://localhost:3000'])).toBe(false);
    });
  });

  describe('getCorsHeaders', () => {
    it('returns correct headers for allowed origin', () => {
      const headers = getCorsHeaders('http://localhost:3000');
      expect(headers).toEqual({
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Timestamp',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      });
    });

    it('returns empty object for disallowed origin', () => {
      expect(getCorsHeaders('http://evil.com')).toEqual({});
    });

    it('merges custom options with defaults', () => {
      const customOptions: Partial<CorsOptions> = { allowedMethods: ['GET', 'POST'] };
      const headers = getCorsHeaders('http://localhost:3000', customOptions);
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });
  });
});