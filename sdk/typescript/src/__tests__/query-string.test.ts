import { buildQuery, parseQuery, appendQuery, encodeParams, removeParam } from '../query-string';

describe('query-string', () => {
  describe('buildQuery', () => {
    it('converts simple object to query string', () => {
      expect(buildQuery({ status: 'active', page: '1' })).toBe('status=active&page=1');
    });

    it('encodes special characters', () => {
      expect(buildQuery({ q: 'hello world' })).toBe('q=hello%20world');
    });

    it('handles number and boolean values', () => {
      expect(buildQuery({ page: 1, active: true })).toBe('page=1&active=true');
    });

    it('skips undefined values', () => {
      expect(buildQuery({ a: '1', b: undefined })).toBe('a=1');
    });

    it('skips null values', () => {
      expect(buildQuery({ a: '1', b: null })).toBe('a=1');
    });

    it('returns empty string for empty object', () => {
      expect(buildQuery({})).toBe('');
    });
  });

  describe('parseQuery', () => {
    it('parses simple query string', () => {
      expect(parseQuery('status=active&page=1')).toEqual({ status: 'active', page: '1' });
    });

    it('handles leading question mark', () => {
      expect(parseQuery('?a=1&b=2')).toEqual({ a: '1', b: '2' });
    });

    it('decodes URI components', () => {
      expect(parseQuery('q=hello%20world')).toEqual({ q: 'hello world' });
    });

    it('returns empty object for empty string', () => {
      expect(parseQuery('')).toEqual({});
    });

    it('handles keys with no value', () => {
      expect(parseQuery('foo&bar=1')).toEqual({ foo: '', bar: '1' });
    });
  });

  describe('appendQuery', () => {
    it('appends to URL without existing query', () => {
      expect(appendQuery('/api', { page: '1' })).toBe('/api?page=1');
    });

    it('appends to URL with existing query', () => {
      expect(appendQuery('/api?a=1', { b: '2' })).toBe('/api?a=1&b=2');
    });

    it('returns URL unchanged when all params are null/undefined', () => {
      expect(appendQuery('/api', null)).toBe('/api');
      expect(appendQuery('/api', undefined)).toBe('/api');
    });
  });

  describe('encodeParams', () => {
    it('encodes array values', () => {
      expect(encodeParams({ status: ['active', 'pending'] })).toBe('status=active&status=pending');
    });

    it('returns empty string for empty object', () => {
      expect(encodeParams({})).toBe('');
    });
  });

  describe('removeParam', () => {
    it('removes param from URL', () => {
      expect(removeParam('/api?page=1&limit=10', 'page')).toBe('/api?limit=10');
    });

    it('removes only param', () => {
      expect(removeParam('/api?page=1', 'page')).toBe('/api');
    });

    it('returns URL unchanged if key not found', () => {
      expect(removeParam('/api?page=1', 'limit')).toBe('/api?page=1');
    });
  });
});