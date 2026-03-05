import {encode, decode, encodeUrlSafe, decodeUrlSafe, isBase64, isBase64UrlSafe} from '../base64';

describe('base64', () => {
  it('roundtrips encode/decode', () => expect(decode(encode('Hello World'))).toBe('Hello World'));
  it('encodes known value', () => expect(encode('Hello')).toBe('SGVsbG8='));
  it('decodes known value', () => expect(decode('SGVsbG8=')).toBe('Hello'));
  it('handles empty string', () => { expect(encode('')).toBe(''); expect(decode('')).toBe(''); });
  it('roundtrips special chars', () => expect(decode(encode('café!@#'))).toBe('café!@#'));
  it('encodeUrlSafe roundtrips', () => expect(decodeUrlSafe(encodeUrlSafe('Hello World!'))).toBe('Hello World!'));
  it('encodeUrlSafe has no padding', () => expect(encodeUrlSafe('Hello')).not.toContain('='));
  it('encodeUrlSafe has no plus/slash', () => {
    const encoded = encodeUrlSafe('test+data/here');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
  it('isBase64 validates correctly', () => {
    expect(isBase64('SGVsbG8=')).toBe(true);
    expect(isBase64('AAAA')).toBe(true);
    expect(isBase64('Hello!')).toBe(false);
    expect(isBase64('ABC')).toBe(false);
    expect(isBase64('')).toBe(true);
  });
  it('isBase64UrlSafe validates correctly', () => {
    expect(isBase64UrlSafe('SGVsbG8')).toBe(true);
    expect(isBase64UrlSafe('SGVsbG8=')).toBe(false);
    expect(isBase64UrlSafe('ab-cd_ef')).toBe(true);
  });
});