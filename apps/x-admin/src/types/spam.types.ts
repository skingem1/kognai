/**
 * Spam Detection Types for x-admin Service
 * 
 * Defines types for spam detection functionality including check types,
 * results, and configuration.
 */

import { Escalation } from '@x-common/types';

/**
 * Enum representing the type of spam check performed.
 */
export enum SpamCheckType {
  DUPLICATE_CONTENT = 'DUPLICATE_CONTENT',
  EXCESSIVE_CAPS = 'EXCESSIVE_CAPS',
  EXCESSIVE_PUNCTUATION = 'EXCESSIVE_PUNCTUATION',
  BLACKLIST_KEYWORD = 'BLACKLIST_KEYWORD',
}

/**
 * Interface representing the result of a spam check.
 */
export interface SpamCheckResult {
  /** Whether the content was flagged as spam */
  isSpam: boolean;
  /** The type of spam check performed */
  type: SpamCheckType;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Human-readable reason for the spam detection */
  reason: string;
}

/**
 * Interface for configuring the spam detector.
 */
export interface SpamDetectorConfig {
  /** Time window in milliseconds for duplicate content detection (5 minutes) */
  duplicateWindowMs: number;
  /** Maximum ratio of uppercase characters to trigger EXCESSIVE_CAPS (0.6 = 60%) */
  maxCapsRatio: number;
  /** Maximum ratio of punctuation characters to trigger EXCESSIVE_PUNCTUATION (0.4 = 40%) */
  maxPunctuationRatio: number;
  /** Array of keywords used to flag BLACKLIST_KEYWORD spam */
  blacklistKeywords: string[];
}

/**
 * Extension of the existing Escalation interface with spam detection fields.
 * Extends the base Escalation type with spam-related properties.
 */
export interface EscalationWithSpam extends Escalation {
  /** Whether the escalation content was flagged as spam */
  isSpam: boolean;
  /** Array of spam check results performed on the escalation */
  spamCheckResults: SpamCheckResult[];
}