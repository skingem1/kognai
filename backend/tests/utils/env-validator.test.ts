import { validateEnv, maskSecret, EnvConfig } from '../../src/utils/env-validator';

describe('env-validator', () => {
  const originalEnv = process.env;

  beforeEach(() => { process.env = { ...originalEnv }; });
  afterAll(() => { process.env = originalEnv; });

  describe('maskSecret', () => {
    it('returns **** for values under 10 chars', () => {
      expect(maskSecret('abc')).toBe('****');
      expect(maskSecret('123456789')).toBe('****');
    });

    it('shows first 4 and last 4 chars for longer values', () => {
      expect(maskSecret('my-secret-key')).toBe('my-s***ey');
      expect(maskSecret('anthropic-api-key-12345')).toBe('anth***2345');
    });
  });

  describe('validateEnv', () => {
    it('returns config with defaults when all required vars present', () => {
      process.env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost:5432/db',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        MINIMAX_API_KEY: 'mm-test',
      };
      const config = validateEnv() as EnvConfig;
      expect(config.PORT).toBe(3000);
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.NODE_ENV).toBe('production');
    });

    it('throws error listing ALL missing required vars', () => {
      process.env = {};
      expect(() => validateEnv()).toThrow('NODE_ENV, DATABASE_URL, ANTHROPIC_API_KEY, MINIMAX_API_KEY');
    });

    it('uses PORT from env when provided', () => {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost:5432/db',
        ANTHROPIC_API_KEY: 'key',
        MINIMAX_API_KEY: 'key',
        PORT: '4000',
      };
      expect(validateEnv().PORT).toBe(4000);
    });
  });
});