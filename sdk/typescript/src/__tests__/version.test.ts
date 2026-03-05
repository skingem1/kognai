import { version, sdkUserAgent, isCompatibleApiVersion } from '../version';

describe('version', () => {
  it('exports correct version string', () => {
    expect(version).toBe('1.0.0');
  });

  it('exports correct SDK user agent', () => {
    expect(sdkUserAgent).toBe('countable-sdk-typescript/1.0.0');
  });

  it('returns true for matching major version 1.0.0', () => {
    expect(isCompatibleApiVersion('1.0.0')).toBe(true);
  });

  it('returns true for different minor/patch with major 1', () => {
    expect(isCompatibleApiVersion('1.5.3')).toBe(true);
  });

  it('returns false for major version 2', () => {
    expect(isCompatibleApiVersion('2.0.0')).toBe(false);
  });

  it('returns false for major version 0', () => {
    expect(isCompatibleApiVersion('0.9.0')).toBe(false);
  });

  it('returns true for version without dots', () => {
    expect(isCompatibleApiVersion('1')).toBe(true);
  });
});