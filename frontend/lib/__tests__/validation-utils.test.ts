import { isValidEmail, isValidUrl, hasMinLength, hasMaxLength, isPositiveNumber, isValidApiKey } from '../validation-utils';

describe('isValidEmail', () => {
  it('returns true for valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('name@domain.co.uk')).toBe(true);
  });
  it('returns false for invalid emails', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('returns true for valid http/https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('https://api.invoica.com/v1')).toBe(true);
  });
  it('returns false for invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('ftp://files.example.com')).toBe(false);
  });
});

describe('hasMinLength', () => {
  it('returns true when string meets minimum length', () => {
    expect(hasMinLength('hello', 3)).toBe(true);
    expect(hasMinLength('abc', 3)).toBe(true);
  });
  it('returns false when string is below minimum', () => {
    expect(hasMinLength('hi', 3)).toBe(false);
    expect(hasMinLength('', 1)).toBe(false);
    expect(hasMinLength('', 0)).toBe(true);
  });
});

describe('hasMaxLength', () => {
  it('returns true when string is within limit', () => {
    expect(hasMaxLength('hello', 10)).toBe(true);
    expect(hasMaxLength('hello', 5)).toBe(true);
    expect(hasMaxLength('', 0)).toBe(true);
  });
  it('returns false when string exceeds limit', () => {
    expect(hasMaxLength('hello world this is long', 10)).toBe(false);
  });
});

describe('isPositiveNumber', () => {
  it('returns true for positive numbers', () => {
    expect(isPositiveNumber(5)).toBe(true);
    expect(isPositiveNumber(0.5)).toBe(true);
  });
  it('returns false for non-positive values', () => {
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(NaN)).toBe(false);
    expect(isPositiveNumber(Infinity)).toBe(false);
  });
});

describe('isValidApiKey', () => {
  it('returns true for valid API keys', () => {
    expect(isValidApiKey('sk-test-abc123xyz789aa')).toBe(true);
    expect(isValidApiKey('sk-12345678901234567')).toBe(true);
  });
  it('returns false for invalid API keys', () => {
    expect(isValidApiKey('pk-test-abc123xyz789')).toBe(false);
    expect(isValidApiKey('sk-short')).toBe(false);
    expect(isValidApiKey('')).toBe(false);
  });
});