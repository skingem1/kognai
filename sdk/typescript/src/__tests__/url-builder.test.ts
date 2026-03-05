import { joinPath, appendQueryParams, buildUrl } from '../url-builder';

describe('joinPath', () => {
  it('should join multiple segments and normalize slashes', () => {
    expect(joinPath('/api', '/invoices', '/inv_1')).toBe('/api/invoices/inv_1');
  });

  it('should handle trailing slashes on segments', () => {
    expect(joinPath('api/', '/invoices/')).toBe('api/invoices');
  });

  it('should handle single segment', () => {
    expect(joinPath('/api')).toBe('/api');
  });

  it('should handle empty segments in the middle', () => {
    expect(joinPath('api', '', 'invoices')).toBe('api/invoices');
  });

  it('should handle leading segment being empty string', () => {
    expect(joinPath('', 'invoices')).toBe('invoices');
  });

  it('should handle no arguments', () => {
    expect(joinPath()).toBe('');
  });
});

describe('appendQueryParams', () => {
  it('should append multiple query params', () => {
    expect(appendQueryParams('/invoices', { limit: '10', status: 'paid' })).toBe('/invoices?limit=10&status=paid');
  });

  it('should handle numeric and boolean values', () => {
    expect(appendQueryParams('/invoices', { limit: 10, active: true })).toBe('/invoices?limit=10&active=true');
  });

  it('should skip undefined and null values', () => {
    expect(appendQueryParams('/invoices', { offset: undefined, limit: '5', active: null })).toBe('/invoices?limit=5');
  });

  it('should handle empty params object', () => {
    expect(appendQueryParams('/invoices', {})).toBe('/invoices');
  });

  it('should handle missing params argument', () => {
    expect(appendQueryParams('/invoices')).toBe('/invoices');
  });
});

describe('buildUrl', () => {
  it('should combine base URL with path segments', () => {
    expect(buildUrl('https://api.com', ['invoices', 'inv_1'])).toBe('https://api.com/invoices/inv_1');
  });

  it('should combine base URL, segments, and query params', () => {
    expect(buildUrl('https://api.com', ['invoices'], { status: 'paid' })).toBe('https://api.com/invoices?status=paid');
  });

  it('should normalize trailing slashes on base URL and segments', () => {
    expect(buildUrl('https://api.com/', ['/invoices/'], { limit: '10' })).toBe('https://api.com/invoices?limit=10');
  });

  it('should handle no query params', () => {
    expect(buildUrl('https://api.com', ['invoices'])).toBe('https://api.com/invoices');
  });
});