/**
 * API Key Generation Utility
 * 
 * Provides functions for generating and hashing API keys for secure storage.
 * Supports both live and test key variants with proper prefixing.
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Prefix for live production API keys
 */
export const API_KEY_PREFIX = 'inv_live_' as const;

/**
 * Prefix for test/sandbox API keys
 */
export const TEST_KEY_PREFIX = 'inv_test_' as const;

/**
 * Type for the generated API key result
 */
export interface GeneratedApiKey {
  key: string;
  hash: string;
}

/**
 * Generates a new API key with the appropriate prefix and hash for storage.
 * 
 * @param isTest - Whether to generate a test key (default: false for live key)
 * @returns Object containing the plain text key and its SHA256 hash
 * @throws Error if key generation fails
 * 
 * @example
 * const { key, hash } = generateApiKey(false);
 * // key: "inv_live_abc123...", hash: "sha256hash..."
 */
export function generateApiKey(isTest: boolean = false): GeneratedApiKey {
  if (typeof isTest !== 'boolean') {
    throw new TypeError('isTest parameter must be a boolean');
  }

  try {
    const randomBytesResult = randomBytes(32);
    
    if (!randomBytesResult || randomBytesResult.length !== 32) {
      throw new Error('Failed to generate secure random bytes');
    }

    const hex = randomBytesResult.toString('hex');
    const prefix = isTest ? TEST_KEY_PREFIX : API_KEY_PREFIX;
    const fullKey = prefix + hex;
    const hash = hashApiKey(fullKey);

    return {
      key: fullKey,
      hash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during key generation';
    throw new Error(`API key generation failed: ${message}`);
  }
}

/**
 * Creates a SHA256 hash of the given API key for secure storage.
 * 
 * @param key - The plain text API key to hash
 * @returns The hexadecimal SHA256 hash of the key
 * @throws Error if hashing fails
 * 
 * @example
 * const hash = hashApiKey("inv_live_abc123...");
 * // hash: "sha256hash..."
 */
export function hashApiKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('key parameter must be a non-empty string');
  }

  try {
    return createHash('sha256').update(key).digest('hex');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during key hashing';
    throw new Error(`API key hashing failed: ${message}`);
  }
}

/**
 * Determines whether the given API key is a test key based on its prefix.
 * 
 * @param key - The API key to check
 * @returns True if the key starts with the test prefix, false otherwise
 * @throws Error if key parameter is invalid
 * 
 * @example
 * const isTest = isTestKey("inv_test_abc123...");
 * // isTest: true
 * 
 * const isLive = isTestKey("inv_live_abc123...");
 * // isLive: false
 */
export function isTestKey(key: string): boolean {
  if (typeof key !== 'string') {
    throw new TypeError('key parameter must be a string');
  }

  return key.startsWith(TEST_KEY_PREFIX);
}