import { parseCookies, serializeCookie, getCookie, deleteCookie } from '../cookie';

describe('cookie', () => {
  it('parseCookies parses cookie string', () => {
    expect(parseCookies('foo=bar; baz=qux')).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('parseCookies handles empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('parseCookies decodes values', () => {
    expect(parseCookies('name=hello%20world')).toEqual({ name: 'hello world' });
  });

  it('serializeCookie basic', () => {
    expect(serializeCookie('foo', 'bar')).toBe('foo=bar');
  });

  it('serializeCookie with options', () => {
    expect(serializeCookie('foo', 'bar', { maxAge: 3600, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' })).toBe('foo=bar; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict');
  });

  it('getCookie returns value', () => {
    expect(getCookie('a=1; b=2', 'b')).toBe('2');
  });

  it('getCookie returns undefined for missing', () => {
    expect(getCookie('a=1', 'z')).toBeUndefined();
  });

  it('deleteCookie sets maxAge 0', () => {
    expect(deleteCookie('foo')).toContain('Max-Age=0');
  });

  it('deleteCookie includes path', () => {
    expect(deleteCookie('foo', '/app')).toContain('Path=/app');
  });
});