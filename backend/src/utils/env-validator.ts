/**
 * Environment configuration validator utility
 * Validates required environment variables and provides type-safe access
 * @packageDocumentation
 */

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  MINIMAX_API_KEY: string;
  SUPERVISOR_URL?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const REQUIRED_ENV_VARS: readonly string[] = [
  'NODE_ENV',
  'DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'MINIMAX_API_KEY',
] as const;

/**
 * Masks a secret value for safe logging
 * Shows first 4 and last 4 characters with *** in between
 * Returns '****' if value length is under 10 characters
 * @param value - The secret value to mask
 * @returns Masked string (e.g., "abcd***efgh" or "****")
 */
export function maskSecret(value: string): string {
  if (value.length < 10) {
    return '****';
  }

  const firstFour: string = value.slice(0, 4);
  const lastFour: string = value.slice(-4);

  return `${firstFour}***${lastFour}`;
}

/**
 * Coerces PORT environment variable to number with default 3000
 * @param portValue - Raw PORT value from process.env
 * @returns Valid port number
 */
function coercePort(portValue: string | undefined): number {
  if (portValue === undefined || portValue === '') {
    return 3000;
  }

  const parsed: number = parseInt(portValue, 10);

  if (Number.isNaN(parsed)) {
    return 3000;
  }

  return parsed;
}

/**
 * Validates all required environment variables and returns typed config
 * @returns Validated environment configuration object
 * @throws Error with list of ALL missing environment variables
 */
export function validateEnv(): EnvConfig {
  const missingVars: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    const value: string | undefined = process.env[varName];
    if (value === undefined || value.trim() === '') {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  const rawLogLevel: string | undefined = process.env.LOG_LEVEL;
  const logLevel: 'debug' | 'info' | 'warn' | 'error' =
    rawLogLevel === 'debug' ||
    rawLogLevel === 'info' ||
    rawLogLevel === 'warn' ||
    rawLogLevel === 'error'
      ? rawLogLevel
      : 'info';

  const config: EnvConfig = {
    PORT: coercePort(process.env.PORT),
    NODE_ENV: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
    DATABASE_URL: process.env.DATABASE_URL as string,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY as string,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY as string,
    SUPERVISOR_URL: process.env.SUPERVISOR_URL,
    LOG_LEVEL: logLevel,
  };

  return config;
}