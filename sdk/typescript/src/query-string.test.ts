import { buildQuery, parseQuery, appendQuery } from './query-string';

describe('buildQuery', () => {
  it('should build basic key-value pairs', () => {
    expect(buildQuery({ foo: 'bar', baz: 'qux' })).toBe('foo=bar&baz=qux');
  });

  it('should handle numbers and booleans', () => {
    expect(buildQuery({ count: 1, active: true })).toBe('count=1&active=true');
  });

  it('should skip undefined and null values', () => {
    expect(buildQuery({ a: 'value', b: undefined, c: null })).toBe('a=value');
  });

  it('should return empty string for empty object', () => {
    expect(buildQuery({})).toBe('');
  });

  it('should encode special characters', () => {
    expect(buildQuery({ search: 'hello world' })).toBe('search=hello%20world');
  });
});

describe('parseQuery', () => {
  it('should parse basic query string', () => {
    expect(parseQuery('foo=bar&baz=qux')).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('should strip leading ?', () => {
    expect(parseQuery('?foo=bar')).toEqual({ foo: 'bar' });
  });

  it('should decode special characters', () => {
    expect(parseQuery('search=hello%20world')).toEqual({ search: 'hello world' });
  });

  it('should return empty object for empty string', () => {
    expect(parseQuery('')).toEqual({});
  });

  it('should handle keys with no value', () => {
    expect(parseQuery('foo&bar=1')).toEqual({ foo: '', bar: '1' });
  });
});

describe('appendQuery', () => {
  it('should append params to URL without query', () => {
    expect(appendQuery('https://example.com', { foo: 'bar' })).toBe('https://example.com?foo=bar');
  });

  it('should append to URL with existing query params', () => {
    expect(appendQuery('https://example.com?existing=1', { foo: 'bar' })).toBe('https://example.com?existing=1&foo=bar');
  });

  it('should return original URL for empty params', () => {
    expect(appendQuery('https://example.com', {})).toBe('https://example.com');
  });

  it('should handle multiple params', () => {
    expect(appendQuery('https://example.com', { a: '1', b: '2' })).toBe('https://example.com?a=1&b=2');
  });
});