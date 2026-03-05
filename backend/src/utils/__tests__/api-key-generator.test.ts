import { generateApiKey, hashApiKey, isTestKey, TEST_KEY_PREFIX, API_KEY_PREFIX } from '../api-key-generator';

describe('api-key-generator', () => {
  const livePrefix = API_KEY_PREFIX;
  const testPrefix = TEST_KEY_PREFIX;

  it('generateApiKey() produces key starting with inv_live_', () => {
    const { key } = generateApiKey(false);
    expect(key.startsWith(livePrefix)).toBe(true);
  });

  it('generateApiKey(true) produces key starting with inv_test_', () => {
    const { key } = generateApiKey(true);
    expect(key.startsWith(testPrefix)).toBe(true);
  });

  it('generated key hash matches hashApiKey(key)', () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
  });

  it('each call generates unique keys', () => {
    const { key: key1 } = generateApiKey();
    const { key: key2 } = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('hashApiKey is deterministic', () => {
    const key = generateApiKey().key;
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('isTestKey returns true for test keys and false for live keys', () => {
    const liveKey = generateApiKey(false).key;
    const testKey = generateApiKey(true).key;
    expect(isTestKey(testKey)).toBe(true);
    expect(isTestKey(liveKey)).toBe(false);
  });

  it('key format includes random hex characters after prefix', () => {
    const { key } = generateApiKey();
    const suffix = key.slice(livePrefix.length);
    expect(suffix.length).toBeGreaterThan(0);
    expect(/^[a-f0-9]+$/.test(suffix)).toBe(true);
  });
});