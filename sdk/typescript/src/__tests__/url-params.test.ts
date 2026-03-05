import { parseParams, buildParams, mergeParams, removeParam } from '../url-params';

describe('url-params', () => {
  describe('parseParams', () => {
    it('parses query string', () => {
      expect(parseParams('foo=bar&baz=qux')).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('handles leading ?', () => {
      expect(parseParams('?foo=bar')).toEqual({ foo: 'bar' });
    });

    it('handles empty string', () => {
      expect(parseParams('')).toEqual({});
    });

    it('decodes encoded values', () => {
      expect(parseParams('q=hello%20world')).toEqual({ q: 'hello world' });
    });
  });

  describe('buildParams', () => {
    it('builds query string', () => {
      expect(buildParams({ foo: 'bar', n: 1 })).toBe('foo=bar&n=1');
    });

    it('handles boolean', () => {
      expect(buildParams({ active: true })).toBe('active=true');
    });

    it('encodes special chars', () => {
      expect(buildParams({ q: 'hello world' })).toBe('q=hello%20world');
    });
  });

  describe('mergeParams', () => {
    it('merges two sets', () => {
      expect(mergeParams('a=1&b=2', { b: '3', c: '4' })).toBe('a=1&b=3&c=4');
    });
  });

  describe('removeParam', () => {
    it('removes a key', () => {
      expect(removeParam('a=1&b=2&c=3', 'b')).toBe('a=1&c=3');
    });

    it('returns same if key not found', () => {
      expect(removeParam('a=1', 'z')).toBe('a=1');
    });
  });
});