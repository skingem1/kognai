import process from 'node:process';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Metadata object for structured logging
 */
export interface LogMeta {
  [key: string]: unknown;
}

/**
 * Logger interface defining the available logging methods
 */
export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
}

/**
 * Determines if the application is running in production mode
 * @returns true if NODE_ENV is 'production', false otherwise
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns the current timestamp in ISO 8601 format
 * @returns ISO formatted timestamp string
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Formats a log message based on the environment
 * @param level - The log level
 * @param message - The log message
 * @param meta - Optional metadata to include
 * @returns Formatted log string
 */
function formatMessage(
  level: LogLevel,
  message: string,
  meta?: LogMeta
): string {
  if (isProduction()) {
    const logObject: Record<string, unknown> = {
      timestamp: formatTimestamp(),
      level,
      message,
    };

    if (meta !== undefined) {
      Object.assign(logObject, meta);
    }

    return JSON.stringify(logObject);
  }

  const timestamp = formatTimestamp();
  const levelUpper = level.toUpperCase().padEnd(5);
  const metaString = meta ? ` ${JSON.stringify(meta)}` : '';
  
  return `[${timestamp}] ${levelUpper}: ${message}${metaString}`;
}

/**
 * Creates a logger method for a specific log level
 * @param level - The log level for this method
 * @returns A logger function for the specified level
 */
function createLogMethod(level: LogLevel) {
  return (message: string, meta?: LogMeta): void => {
    const formattedMessage = formatMessage(level, message, meta);

    switch (level) {
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
      case 'debug':
        console.debug(formattedMessage);
        break;
    }
  };
}

/**
 * Structured logger instance for the Countable backend
 */
export const logger: Logger = {
  info: createLogMethod('info'),
  warn: createLogMethod('warn'),
  error: createLogMethod('error'),
  debug: createLogMethod('debug'),
};

/**
 * Default export of the logger instance
 */
export default logger;