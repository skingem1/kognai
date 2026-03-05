export interface RequestLogEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
  ip: string;
  userAgent: string;
}

const SKIP_PATHS = ['/v1/health', '/favicon.ico'];

export function formatLogEntry(entry: RequestLogEntry): string {
  return `[${entry.timestamp}] ${entry.method} ${entry.path} ${entry.statusCode} ${entry.durationMs}ms ${entry.ip}`;
}

export function createRequestLog(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  ip: string,
  userAgent: string
): RequestLogEntry {
  return { method, path, statusCode, durationMs, timestamp: new Date().toISOString(), ip, userAgent };
}

export function shouldLog(path: string): boolean {
  return !SKIP_PATHS.includes(path);
}