import { describe, it, expect } from '@jest/globals';
import { buildUrl, buildHeaders } from '../src/request-builder';

describe('buildUrl', () => {
  it('creates URL from base and path', () => {
    expect(buildUrl('https://api.test.com', '/invoices')).toBe('https://api.test.com/invoices');
  });

  it('appends query parameters', () => {
    const url = buildUrl('https://api.test.com', '/invoices', { limit: 10, status: 'active' });
    expect(url).toContain('limit=10');
    expect(url).toContain('status=active');
  });

  it('skips undefined query values', () => {
    const url = buildUrl('https://api.test.com', '/x', { a: 'yes', b: undefined });
    expect(url).toContain('a=yes');
    expect(url).not.toContain('b=');
  });

  it('handles boolean and number query params', () => {
    const url = buildUrl('https://api.test.com', '/x', { active: true, page: 5 });
    expect(url).toContain('active=true');
    expect(url).toContain('page=5');
  });

  it('returns URL without query string when no query provided', () => {
    const url = buildUrl('https://api.test.com', '/x');
    expect(url).not.toContain('?');
  });
});

describe('buildHeaders', () => {
  it('includes Authorization with Bearer prefix', () => {
    expect(buildHeaders('test-key').Authorization).toBe('Bearer test-key');
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

  it('returns exactly 3 keys without extra headers', () => {
    expect(Object.keys(buildHeaders('key'))).toHaveLength(3);
  });
});