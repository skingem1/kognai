import { buildUrl, buildHeaders } from '../request-builder';

describe('request-builder', () => {
  describe('buildUrl', () => {
    it('returns correct URL with base and path only', () => {
      expect(buildUrl('https://api.example.com', '/v1/users')).toBe('https://api.example.com/v1/users');
    });

    it('appends query params as search params', () => {
      const url = buildUrl('https://api.example.com', '/v1/users', { page: '1', limit: '10' });
      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
    });

    it('skips undefined query values', () => {
      const url = buildUrl('https://api.example.com', '/v1/search', { q: 'test', filter: undefined });
      expect(url).toBe('https://api.example.com/v1/search?q=test');
    });

    it('converts number and boolean to strings', () => {
      const url = buildUrl('https://api.example.com', '/v1/filter', { count: 5, active: true });
      expect(url).toContain('count=5');
      expect(url).toContain('active=true');
    });
  });

  describe('buildHeaders', () => {
    it('returns Authorization with Bearer prefix', () => {
      const headers = buildHeaders('secret-key');
      expect(headers.Authorization).toBe('Bearer secret-key');
    });

    it('includes Content-Type and User-Agent', () => {
      const headers = buildHeaders('key');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['User-Agent']).toBe('countable-sdk/1.0.0');
    });

    it('merges extra headers', () => {
      const headers = buildHeaders('key', { 'X-Custom': 'value' });
      expect(headers['X-Custom']).toBe('value');
    });

    it('allows extra headers to override defaults', () => {
      const headers = buildHeaders('key', { 'User-Agent': 'custom-ua' });
      expect(headers['User-Agent']).toBe('custom-ua');
    });
  });
});