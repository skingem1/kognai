export interface DebugLogger {
  log(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function isDebugEnabled(): boolean {
  return Boolean(process.env.INVOICA_DEBUG);
}

function formatMessage(namespace: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[invoica:${namespace}] ${timestamp} ${message}`;
}

export function createDebugLogger(namespace: string): DebugLogger {
  const enabled = isDebugEnabled();

  if (!enabled) {
    return {
      log: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  return {
    log: (message: string, data?: unknown) => {
      console.log(formatMessage(namespace, message), data ?? '');
    },
    warn: (message: string, data?: unknown) => {
      console.warn(formatMessage(namespace, message), data ?? '');
    },
    error: (message: string, data?: unknown) => {
      console.error(formatMessage(namespace, message), data ?? '');
    },
  };
}