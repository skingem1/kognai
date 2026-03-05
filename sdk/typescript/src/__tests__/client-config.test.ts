import { resolveConfig, DEFAULT_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES } from '../client-config';

describe('client-config', () => {
  it('exports correct default constants', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.invoica.ai/v1');
    expect(DEFAULT_TIMEOUT).toBe(30000);
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it('returns defaults when only apiKey provided', () => {
    const result = resolveConfig({ apiKey: 'test-key' });
    expect(result).toEqual({
      apiKey: 'test-key',
      baseUrl: DEFAULT_BASE_URL,
      timeout: DEFAULT_TIMEOUT,
      maxRetries: DEFAULT_MAX_RETRIES,
    });
  });

  it('returns provided values when all options set', () => {
    const result = resolveConfig({
      apiKey: 'key',
      baseUrl: 'https://custom.api/v1',
      timeout: 5000,
      maxRetries: 5,
    });
    expect(result.baseUrl).toBe('https://custom.api/v1');
    expect(result.timeout).toBe(5000);
    expect(result.maxRetries).toBe(5);
  });

  it('trims whitespace from apiKey', () => {
    const result = resolveConfig({ apiKey: '  trimmed-key  ' });
    expect(result.apiKey).toBe('trimmed-key');
  });

  it('throws for empty string apiKey', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow('apiKey is required and cannot be empty');
  });

  it('throws for undefined apiKey', () => {
    expect(() => resolveConfig({ apiKey: undefined as any })).toThrow('apiKey is required and cannot be empty');
  });

  it('applies partial overrides correctly', () => {
    const result = resolveConfig({ apiKey: 'key', timeout: 10000 });
    expect(result.timeout).toBe(10000);
    expect(result.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(result.maxRetries).toBe(DEFAULT_MAX_RETRIES);
  });
});