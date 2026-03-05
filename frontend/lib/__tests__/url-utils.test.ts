import {buildUrl, parseQueryParams, joinPaths, isAbsoluteUrl, getPathSegments, addTrailingSlash, removeTrailingSlash} from '../url-utils';

describe('url-utils', () => {
  it('buildUrl with base only', () => expect(buildUrl('/api')).toBe('/api'));
  it('buildUrl with params', () => expect(buildUrl('/api', {page:'1', limit:'10'})).toContain('page=1&limit=10'));
  it('buildUrl skips undefined/null', () => expect(buildUrl('/api', {a:'1', b:undefined, c:null})).toBe('/api?a=1'));
  it('buildUrl converts numbers', () => expect(buildUrl('/api', {page:2})).toContain('page=2'));
  it('buildUrl sorts params alphabetically', () => expect(buildUrl('/api', {z:'1', a:'2'})).toBe('/api?a=2&z=1'));

  it('parseQueryParams with leading ?', () => expect(parseQueryParams('?foo=bar&baz=1')).toEqual({foo:'bar', baz:'1'}));
  it('parseQueryParams without leading ?', () => expect(parseQueryParams('foo=bar')).toEqual({foo:'bar'}));
  it('parseQueryParams empty string', () => expect(parseQueryParams('')).toEqual({}));

  it('joinPaths basic', () => expect(joinPaths('api', 'v1', 'invoices')).toBe('api/v1/invoices'));
  it('joinPaths removes duplicate slashes', () => expect(joinPaths('/api/', '/v1/')).toBe('/api/v1'));
  it('joinPaths preserves protocol', () => expect(joinPaths('https://api.com/', '/v1')).toBe('https://api.com/v1'));

  it('isAbsoluteUrl https is absolute', () => expect(isAbsoluteUrl('https://x.com')).toBe(true));
  it('isAbsoluteUrl relative is not', () => expect(isAbsoluteUrl('/api')).toBe(false));
  it('isAbsoluteUrl protocol-relative', () => expect(isAbsoluteUrl('//x.com')).toBe(true));

  it('getPathSegments basic', () => expect(getPathSegments('/api/v1/invoices')).toEqual(['api','v1','invoices']));
  it('getPathSegments no leading slash', () => expect(getPathSegments('api/v1')).toEqual(['api','v1']));

  it('addTrailingSlash', () => expect(addTrailingSlash('/api')).toBe('/api/'));
  it('addTrailingSlash idempotent', () => expect(addTrailingSlash('/api/')).toBe('/api/'));
  it('removeTrailingSlash', () => expect(removeTrailingSlash('/api/')).toBe('/api'));
  it('removeTrailingSlash preserves root', () => expect(removeTrailingSlash('/')).toBe('/'));
});