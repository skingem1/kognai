/**
 * Spam Blacklist Types
 * Type definitions for the spam blacklist feature
 */

/**
 * Redis key configuration for spam blacklist
 */
export interface SpamBlacklistConfig {
  redisKey: string;
}

/**
 * Result of domain validation
 */
export interface DomainValidationResult {
  isSpam: boolean;
}

/**
 * Result of adding a domain to the blacklist
 * Returns void on success, or an error object on failure
 */
export type AddDomainResult = void | { error: Error };

/**
 * Result of removing a domain from the blacklist
 * Returns void on success, or an error object on failure
 */
export type RemoveDomainResult = void | { error: Error };