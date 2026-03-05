/**
 * Structured logging utility for SDK debug output.
 * @packageDocumentation
 */

/**
 * Log severity levels ordered by verbosity.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Represents a structured log entry.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: unknown;
}

/**
 * Logger interface for structured logging.
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

/**
 * Maps LogLevel to string names for output.
 */
const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

/**
 * Generates ISO 8601 timestamp.
 */
function createTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Formats a LogEntry into a readable string.
 * @param entry - The log entry to format
 * @returns Formatted string: '[timestamp] [LEVEL] [context] message'
 */
export function formatLogEntry(entry: LogEntry): string {
  const levelName = LEVEL_NAMES[entry.level] ?? 'UNKNOWN';
  const contextStr = entry.context ? ` [${entry.context}]` : '';
  return `[${entry.timestamp}] [${levelName}]${contextStr} ${entry.message}`;
}

/**
 * Creates a logger instance with specified context and minimum log level.
 * @param context - Identifier for the logging source
 * @param level - Minimum severity level to output (defaults to WARN)
 * @returns A Logger instance
 */
export function createLogger(context: string = 'invoica-sdk', level: LogLevel = LogLevel.WARN): Logger {
  let currentLevel: LogLevel = level;

  const log = (methodLevel: LogLevel, message: string, data?: unknown): void => {
    if (methodLevel < currentLevel) return;

    const entry: LogEntry = {
      level: methodLevel,
      message,
      timestamp: createTimestamp(),
      context,
      data,
    };

    const formatted = formatLogEntry(entry);
    const consoleMethod = methodLevel === LogLevel.DEBUG ? console.debug
      : methodLevel === LogLevel.INFO ? console.info
      : methodLevel === LogLevel.WARN ? console.warn
      : console.error;

    data !== undefined ? consoleMethod(formatted, data) : consoleMethod(formatted);
  };

  return {
    debug: (message: string, data?: unknown): void => log(LogLevel.DEBUG, message, data),
    info: (message: string, data?: unknown): void => log(LogLevel.INFO, message, data),
    warn: (message: string, data?: unknown): void => log(LogLevel.WARN, message, data),
    error: (message: string, data?: unknown): void => log(LogLevel.ERROR, message, data),
    setLevel: (level: LogLevel): void => { currentLevel = level; },
    getLevel: (): LogLevel => currentLevel,
  };
}