/**
 * Unique ID generation utilities for invoices, API keys, and idempotency keys.
 * Pure functions using Math.random() and Date.now().
 */

/**
 * Generates a unique ID with optional prefix.
 * Format: {prefix}{timestamp_hex}_{random_hex}
 * @param prefix - Optional prefix for the ID (e.g., 'inv_')
 * @returns Generated unique ID string (e.g., 'inv_18d4a2f3b_1a2b3c4d')
 */
export function generateId(prefix: string = ''): string {
  const timestampHex = Date.now().toString(16);
  const randomHex = Math.random().toString(16).slice(2, 10);
  return `${prefix}${timestampHex}_${randomHex}`;
}

/**
 * Generates a 40-character hex API key.
 * Concatenates 5 calls to Math.random().toString(16).slice(2, 10)
 * @returns 40-character hex API key string
 */
export function generateApiKey(): string {
  const segments: string[] = [];
  for (let i = 0; i < 5; i++) {
    segments.push(Math.random().toString(16).slice(2, 10));
  }
  return segments.join('');
}

/**
 * Generates a UUID v4-like string using Math.random().
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * x = random hex digit, y = one of 8, 9, a, b (variant bits), 4 = version
 * @returns UUID v4-like string
 */
export function generateIdempotencyKey(): string {
  const hexChars = '0123456789abcdef';
  const variantChars = '89ab';

  const getRandomHex = (): string => hexChars[Math.floor(Math.random() * 16)];
  const getVariantChar = (): string => variantChars[Math.floor(Math.random() * 4)];

  const segments = [
    getRandomHex() + getRandomHex() + getRandomHex() + getRandomHex(),
    getRandomHex() + getRandomHex() + getRandomHex() + getRandomHex(),
    '4' + getRandomHex() + getRandomHex() + getRandomHex(),
    getVariantChar() + getRandomHex() + getRandomHex() + getRandomHex(),
    getRandomHex() + getRandomHex() + getRandomHex() + getRandomHex() + getRandomHex() + getRandomHex(),
  ];

  return segments.join('-');
}

/**
 * Validates that an ID matches the generateId format.
 * @param id - The ID to validate
 * @param prefix - Optional prefix to check for
 * @returns true if ID is valid, false otherwise
 */
export function isValidId(id: string, prefix?: string): boolean {
  if (!id || typeof id !== 'string' || id.length === 0) {
    return false;
  }

  const testId = prefix ? id.slice(prefix.length) : id;

  if (!testId.includes('_')) {
    return false;
  }

  const [timestampPart, randomPart] = testId.split('_');

  if (!timestampPart || !randomPart || randomPart.length !== 8) {
    return false;
  }

  const hexRegex = /^[0-9a-f]+$/;
  return hexRegex.test(timestampPart) && hexRegex.test(randomPart);
}

/**
 * Extracts the timestamp from a generated ID.
 * @param id - The generated ID
 * @param prefix - Optional prefix that was used when generating the ID
 * @returns Timestamp as number (ms since epoch), or null if ID format is invalid
 */
export function extractTimestamp(id: string, prefix: string = ''): number | null {
  if (!id || typeof id !== 'string' || id.length === 0) {
    return null;
  }

  const testId = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;

  if (!testId.includes('_')) {
    return null;
  }

  const [timestampPart] = testId.split('_');

  if (!timestampPart) {
    return null;
  }

  const timestamp = parseInt(timestampPart, 16);
  return isNaN(timestamp) ? null : timestamp;
}