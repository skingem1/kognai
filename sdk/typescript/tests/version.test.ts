import { version, sdkUserAgent, isCompatibleApiVersion } from '../src/version';

describe('version', () => {
  it('should export version 1.0.0', () => {
    expect(version).toBe('1.0.0');
  });

  it('should export correct sdkUserAgent', () => {
    expect(sdkUserAgent).toBe('countable-sdk-typescript/1.0.0');
  });
});

describe('isCompatibleApiVersion', () => {
  it('should return true for 1.0.0', () => {
    expect(isCompatibleApiVersion('1.0.0')).toBe(true);
  });

  it('should return true for same major version', () => {
    expect(isCompatibleApiVersion('1.2.3')).toBe(true);
    expect(isCompatibleApiVersion('1.99.0')).toBe(true);
  });

  it('should return false for different major version', () => {
    expect(isCompatibleApiVersion('2.0.0')).toBe(false);
    expect(isCompatibleApiVersion('0.9.0')).toBe(false);
    expect(isCompatibleApiVersion('3.1.0')).toBe(false);
  });
});