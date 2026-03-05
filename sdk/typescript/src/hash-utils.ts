import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Creates a SHA-256 hash of the input string.
 * @param data - The string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Creates a SHA-512 hash of the input string.
 * @param data - The string to hash
 * @returns Hex-encoded SHA-512 hash
 */
export function sha512(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * Creates an HMAC-SHA-256 hash of the input string using the provided secret.
 * @param data - The string to hash
 * @param secret - The secret key for HMAC
 * @returns Hex-encoded HMAC-SHA-256 hash
 */
export function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Creates an MD5 hash of the input string.
 * @param data - The string to hash
 * @returns Hex-encoded MD5 hash
 */
export function md5(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Generates a cryptographically secure random nonce.
 * @param bytes - Number of random bytes (default: 16)
 * @returns Hex-encoded random nonce
 */
export function generateNonce(bytes: number = 16): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Encodes a string to Base64 format.
 * @param data - The string to encode
 * @returns Base64-encoded string
 */
export function toBase64(data: string): string {
  return Buffer.from(data, 'utf-8').toString('base64');
}

/**
 * Decodes a Base64-encoded string back to UTF-8.
 * @param encoded - The Base64-encoded string
 * @returns Decoded UTF-8 string
 */
export function fromBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Encodes a string to Base64URL format (URL-safe variant).
 * @param data - The string to encode
 * @returns Base64URL-encoded string
 */
export function toBase64Url(data: string): string {
  return toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decodes a Base64URL-encoded string back to UTF-8.
 * @param encoded - The Base64URL-encoded string
 * @returns Decoded UTF-8 string
 */
export function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  return fromBase64(padded + '=='.slice(0, remainder ? 4 - remainder : 0));
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}