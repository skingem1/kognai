import { Request, Response, NextFunction } from 'express';

export interface AuditLogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  ip: string;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'x-api-key'];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export function auditLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const responseTimeMs = Date.now() - startTime;
      const ip = req.ip ?? 'unknown';

      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTimeMs,
        ip,
      };

      process.stdout.write(JSON.stringify(logEntry) + '\n');
    });

    next();
  };
}