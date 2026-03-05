import { generateApiKey, getKeyPrefix, validateApiKeyFormat } from '../api-keys';

describe('api-keys/generation', () => {
  it('generateApiKey starts with sk_ prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith('sk_')).toBe(true);
  });

  it('generateApiKey has length 67 (3 prefix + 64 hex)', () => {
    const key = generateApiKey();
    expect(key.length).toBe(67);
  });

  it('generateApiKey produces unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('getKeyPrefix returns first 8 hex chars after sk_', () => {
    const key = generateApiKey();
    const prefix = getKeyPrefix(key);
    expect(prefix.length).toBe(8);
    expect(prefix).toBe(key.substring(3, 11));
  });

  it('validateApiKeyFormat returns true for valid key and false for invalid', () => {
    const validKey = generateApiKey();
    expect(validateApiKeyFormat(validKey)).toBe(true);
    expect(validateApiKeyFormat('invalid')).toBe(false);
  });
});