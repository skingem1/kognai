/**
 * Validation utility functions for form inputs.
 * Pure functions with no external dependencies.
 */

/**
 * Validate an email address format.
 * isValidEmail('user@example.com') => true
 * isValidEmail('invalid') => false
 * isValidEmail('') => false
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.trim() === '') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate a URL format.
 * isValidUrl('https://example.com') => true
 * isValidUrl('http://localhost:3000') => true
 * isValidUrl('not-a-url') => false
 * isValidUrl('') => false
 */
export function isValidUrl(url: string): boolean {
  if (!url || url.trim() === '') {
    return false;
  }
  try {
    const parsedUrl = new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

/**
 * Check if a string meets minimum length requirement.
 * hasMinLength('hello', 3) => true
 * hasMinLength('hi', 3) => false
 * hasMinLength('', 1) => false
 */
export function hasMinLength(value: string, min: number): boolean {
  return value.length >= min;
}

/**
 * Check if a string meets maximum length requirement.
 * hasMaxLength('hello', 10) => true
 * hasMaxLength('hello world this is long', 10) => false
 */
export function hasMaxLength(value: string, max: number): boolean {
  return value.length <= max;
}

/**
 * Validate that a value is a positive number.
 * isPositiveNumber(5) => true
 * isPositiveNumber(0) => false
 * isPositiveNumber(-1) => false
 * isPositiveNumber(NaN) => false
 */
export function isPositiveNumber(value: number): boolean {
  return !isNaN(value) && isFinite(value) && value > 0;
}

/**
 * Validate an API key format (starts with 'sk-' and at least 20 chars).
 * isValidApiKey('sk-test-abc123xyz789aa') => true (24 chars, starts with sk-)
 * isValidApiKey('pk-test-abc123') => false (wrong prefix)
 * isValidApiKey('sk-short') => false (too short)
 */
export function isValidApiKey(key: string): boolean {
  return key.startsWith('sk-') && key.length >= 20;
}