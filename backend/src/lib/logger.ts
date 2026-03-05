/**
 * lib/logger.ts
 *
 * Structured logger for the Invoica backend.
 * Supports both (message, meta?) and (meta, message) call signatures.
 */

import process from 'node:process';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogMeta {
  [key: string]: unknown;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function emit(level: LogLevel, arg1: string | LogMeta, arg2?: string | LogMeta): void {
  let message: string;
  let meta: LogMeta | undefined;

  if (typeof arg1 === 'string') {
    message = arg1;
    meta = arg2 as LogMeta | undefined;
  } else {
    message = arg2 as string;
    meta = arg1;
  }

  let output: string;
  if (isProduction()) {
    output = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta });
  } else {
    const ts = new Date().toISOString();
    const lvl = level.toUpperCase().padEnd(5);
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    output = '[' + ts + '] ' + lvl + ': ' + message + metaStr;
  }

  switch (level) {
    case 'error': console.error(output); break;
    case 'warn':  console.warn(output);  break;
    case 'debug': console.debug(output); break;
    default:      console.log(output);   break;
  }
}

export const logger = {
  info:  (arg1: string | LogMeta, arg2?: string | LogMeta) => emit('info',  arg1, arg2),
  warn:  (arg1: string | LogMeta, arg2?: string | LogMeta) => emit('warn',  arg1, arg2),
  error: (arg1: string | LogMeta, arg2?: string | LogMeta) => emit('error', arg1, arg2),
  debug: (arg1: string | LogMeta, arg2?: string | LogMeta) => emit('debug', arg1, arg2),
};

export default logger;
