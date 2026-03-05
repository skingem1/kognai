import { redactHeaders, auditLogger } from '../audit-logger';

describe('audit-logger', () => {
  describe('redactHeaders', () => {
    it('redacts authorization header', () => {
      const result = redactHeaders({ 'authorization': 'Bearer token123' });
      expect(result).toEqual({ 'authorization': '[REDACTED]' });
    });

    it('redacts x-api-key header', () => {
      const result = redactHeaders({ 'x-api-key': 'secret-key' });
      expect(result).toEqual({ 'x-api-key': '[REDACTED]' });
    });

    it('preserves non-sensitive headers like content-type', () => {
      const result = redactHeaders({ 'content-type': 'application/json' });
      expect(result).toEqual({ 'content-type': 'application/json' });
    });
  });

  describe('auditLogger', () => {
    it('calls next() immediately', () => {
      const req = { method: 'GET', url: '/test', headers: {} };
      const res = { on: jest.fn() };
      const next = jest.fn();
      auditLogger()(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
    });

    it('writes JSON log on finish event', () => {
      const { EventEmitter } = require('events');
      const req = { method: 'GET', url: '/test', headers: {} };
      const res = Object.assign(new EventEmitter(), { statusCode: 200 });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      auditLogger()(req as any, res as any, jest.fn());
      res.emit('finish');
      expect(JSON.parse(writeSpy.mock.calls[0][0])).toMatchObject({ method: 'GET', url: '/test', statusCode: 200 });
      writeSpy.mockRestore();
    });
  });
});