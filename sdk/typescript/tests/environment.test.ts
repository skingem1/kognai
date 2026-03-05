import { detectEnvironment, getDefaultBaseUrl, getUserAgent, supportsStreaming } from '../src/environment';

describe('environment', () => {
  it('detectEnvironment returns node in Node.js', () => {
    expect(detectEnvironment()).toBe('node');
  });

  it('getDefaultBaseUrl returns correct URL', () => {
    expect(getDefaultBaseUrl()).toBe('https://api.invoica.ai/v1');
  });

  it('getUserAgent matches expected format', () => {
    expect(getUserAgent()).toMatch(/^invoica-sdk\/1\.0\.0 \(node\)$/);
  });

  it('getUserAgent contains environment in parentheses', () => {
    expect(getUserAgent()).toMatch(/\(\w+\)/);
  });

  it('supportsStreaming returns boolean', () => {
    expect(typeof supportsStreaming()).toBe('boolean');
  });
});