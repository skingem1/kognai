import {sha256, sha512, hmacSha256, md5, generateNonce, toBase64, fromBase64, toBase64Url, fromBase64Url, constantTimeEqual} from '../hash-utils';

describe('hash-utils', () => {
  describe('hashing', () => {
    it('sha256 returns 64-char hex', () => expect(sha256('hello')).toMatch(/^[a-f0-9]{64}$/));
    it('sha256 is deterministic', () => expect(sha256('test')).toBe(sha256('test')));
    it('sha256 known value', () => expect(sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'));
    it('sha512 returns 128-char hex', () => expect(sha512('hello')).toMatch(/^[a-f0-9]{128}$/));
    it('hmacSha256 returns 64-char hex', () => expect(hmacSha256('data', 'secret')).toMatch(/^[a-f0-9]{64}$/));
    it('hmacSha256 differs with different secrets', () => expect(hmacSha256('data','s1')).not.toBe(hmacSha256('data','s2')));
    it('md5 returns 32-char hex', () => expect(md5('hello')).toMatch(/^[a-f0-9]{32}$/));
  });

  describe('nonce', () => {
    it('generateNonce default 32 hex chars', () => expect(generateNonce()).toMatch(/^[a-f0-9]{32}$/));
    it('generateNonce custom length', () => expect(generateNonce(8)).toMatch(/^[a-f0-9]{16}$/));
    it('generateNonce unique', () => expect(generateNonce()).not.toBe(generateNonce()));
  });

  describe('base64', () => {
    it('toBase64/fromBase64 roundtrip', () => expect(fromBase64(toBase64('hello world'))).toBe('hello world'));
    it('toBase64 known', () => expect(toBase64('hello')).toBe('aGVsbG8='));
  });

  describe('base64url', () => {
    it('toBase64Url/fromBase64Url roundtrip', () => expect(fromBase64Url(toBase64Url('hello+world/test'))).toBe('hello+world/test'));
    it('toBase64Url has no +/=', () => expect(toBase64Url('test>>??')).not.toMatch(/[+/=]/));
  });

  describe('constantTimeEqual', () => {
    it('equal strings', () => expect(constantTimeEqual('abc', 'abc')).toBe(true));
    it('different strings', () => expect(constantTimeEqual('abc', 'def')).toBe(false));
    it('different lengths', () => expect(constantTimeEqual('ab', 'abc')).toBe(false));
  });
});