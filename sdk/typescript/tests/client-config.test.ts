import { resolveConfig, DEFAULT_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES } from '../src/client-config';

describe('client-config', () => {
  it('DEFAULT constants are correct', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.invoica.ai/v1');
    expect(DEFAULT_TIMEOUT).toBe(30000);
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it('resolves config with only apiKey', () => {
    const result = resolveConfig({ apiKey: 'test-key' });
    expect(result).toEqual({ apiKey: 'test-key', baseUrl: DEFAULT_BASE_URL, timeout: DEFAULT_TIMEOUT, maxRetries: DEFAULT_MAX_RETRIES });
  });

  it('resolves config with all fields', () => {
    const input = { apiKey: 'key', baseUrl: 'custom', timeout: 5000, maxRetries: 5 };
    expect(resolveConfig(input)).toEqual(input);
  });

  it('resolves config with custom baseUrl', () => {
    const result = resolveConfig({ apiKey: 'key', baseUrl: 'http://custom' });
    expect(result.baseUrl).toBe('http://custom');
    expect(result.timeout).toBe(DEFAULT_TIMEOUT);
  });

  it('trims apiKey', () => {
    expect(resolveConfig({ apiKey: '  spaced-key  ' }).apiKey).toBe('spaced-key');
  });

  it('throws on empty apiKey', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('throws on whitespace apiKey', () => {
    expect(() => resolveConfig({ apiKey: '   ' })).toThrow();
  });
});