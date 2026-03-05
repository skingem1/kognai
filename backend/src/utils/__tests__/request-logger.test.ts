import { formatLogEntry, createRequestLog, shouldLog, RequestLogEntry } from '../request-logger';

describe('request-logger', () => {
  describe('formatLogEntry', () => {
    it('formats log entry correctly', () => {
      const entry: RequestLogEntry = {
        method: 'GET',
        path: '/v1/invoices',
        statusCode: 200,
        durationMs: 45,
        timestamp: '2026-02-15T10:00:00Z',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };
      const result = formatLogEntry(entry);
      expect(result).toBe('[2026-02-15T10:00:00Z] GET /v1/invoices 200 45ms 192.168.1.1');
    });
  });

  describe('createRequestLog', () => {
    it('creates log entry with ISO timestamp', () => {
      const result = createRequestLog('POST', '/v1/payments', 201, 100, '10.0.0.1', 'curl/7.0');
      expect(result.method).toBe('POST');
      expect(result.path).toBe('/v1/payments');
      expect(result.statusCode).toBe(201);
      expect(result.durationMs).toBe(100);
      expect(result.ip).toBe('10.0.0.1');
      expect(result.userAgent).toBe('curl/7.0');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  describe('shouldLog', () => {
    it('returns false for health endpoint', () => {
      expect(shouldLog('/v1/health')).toBe(false);
    });

    it('returns false for favicon', () => {
      expect(shouldLog('/favicon.ico')).toBe(false);
    });

    it('returns true for other paths', () => {
      expect(shouldLog('/v1/invoices')).toBe(true);
      expect(shouldLog('/v1/users')).toBe(true);
    });
  });
});