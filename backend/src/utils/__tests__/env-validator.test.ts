import { maskSecret, validateEnv } from '../env-validator';

describe('env-validator', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('maskSecret', () => {
    it('returns **** for short string like abc', () => {
      expect(maskSecret('abc')).toBe('****');
    });

    it('returns first4+***+last4 for long string', () => {
      expect(maskSecret('abcdefghijklmnop')).toBe('abcd***mnop');
    });

    it('returns **** for exactly 9 chars', () => {
      expect(maskSecret('abcdefghi')).toBe('****');
    });

    it('returns masked for exactly 10 chars', () => {
      expect(maskSecret('0123456789')).toBe('0123***6789');
    });
  });

  describe('validateEnv', () => {
    it('throws with missing vars message when env is empty', () => {
      process.env = {};
      expect(() => validateEnv()).toThrow(/Missing required environment variables/);
    });
  });
});