/**
 * Ledger Service Configuration
 */

import { LedgerConfig, DEFAULT_LEDGER_CONFIG } from './types';

// In-memory config store (can be replaced with environment variables or config service)
let ledgerConfig: LedgerConfig = { ...DEFAULT_LEDGER_CONFIG };

/**
 * Get the current ledger configuration
 */
export function getLedgerConfig(): LedgerConfig {
  return { ...ledgerConfig };
}

/**
 * Update ledger configuration
 */
export function setLedgerConfig(config: Partial<LedgerConfig>): void {
  ledgerConfig = {
    ...ledgerConfig,
    ...config,
  };
}

/**
 * Reset to default configuration
 */
export function resetLedgerConfig(): void {
  ledgerConfig = { ...DEFAULT_LEDGER_CONFIG };
}

/**
 * Initialize ledger configuration from environment
 */
export function initLedgerConfigFromEnv(): void {
  const reservationExpiry = parseInt(process.env.LEDGER_RESERVATION_EXPIRY_SECONDS || '60', 10);
  const maxRetries = parseInt(process.env.LEDGER_MAX_RETRY_ATTEMPTS || '3', 10);
  const retryDelay = parseInt(process.env.LEDGER_RETRY_DELAY_MS || '100', 10);

  setLedgerConfig({
    reservationExpirySeconds: reservationExpiry,
    maxRetryAttempts: maxRetries,
    retryDelayMs: retryDelay,
  });
}
