import { Request, Response, NextFunction } from 'express';
import { auditLogger, redactHeaders, AuditLogEntry } from '../../src/middleware/audit-logger';

// Mock stdout for capturing log output
let stdoutData = '';
let originalStdoutWrite: (chunk: any, encoding?: any, cb?: any) => boolean;

beforeAll(() => {
  originalStdoutWrite = process.stdout.write;
  process.stdout.write = jest.fn((chunk: any) => {
    stdoutData = chunk;
    return true;
  });
});

afterAll(() => {
  process.stdout.write = originalStdoutWrite;
});

beforeEach(() => {
  stdoutData = '';
});

describe('redactHeaders', () => {
  it('should return empty object when input is empty', () => {
    expect(redactHeaders({})).toEqual({});
  });

  it('should not redact non-sensitive headers', () => {
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'test-agent'
    };
    expect(redactHeaders(headers)).toEqual(headers);
  });

  it('should redact Authorization header', () => {
    const headers = {
      'authorization': 'Bearer secret-token',
      'content-type': 'application/json'
    };
    const result = redactHeaders(headers);
    expect(result['authorization']).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('should redact X-Api-Key header', () => {
    const headers = {
      'x-api-key': 'api-key-12345',
      'content-type': 'application/json'
    };
    const result = redactHeaders(headers);
    expect(result['x-api-key']).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('should handle case-insensitive header names', () => {
    const headers = {
      'AUTHORIZATION': 'Bearer secret-token',
      'X-API-KEY': 'api-key-12345'
    };
    const result = redactHeaders(headers);
    expect(result['AUTHORIZATION']).toBe('[REDACTED]');
    expect(result['X-API-KEY']).toBe('[REDACTED]');
  });

  it('should redact multiple sensitive headers', () => {
    const headers = {
      'authorization': 'Bearer token',
      'x-api-key': 'key123',
      'content-type': 'application/json'
    };
    const result = redactHeaders(headers);
    expect(result['authorization']).toBe('[REDACTED]');
    expect(result['x-api-key']).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });
});

describe('auditLogger', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/test',
      ip: '192.168.1.1'
    };
    mockRes = {
      statusCode: 200,
      on: jest.fn()
    };
    mockNext = jest.fn();
  });

  it('should call next()', () => {
    const middleware = auditLogger();
    middleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should attach finish listener to response', () => {
    const middleware = auditLogger();
    middleware(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should log correct audit entry on finish', () => {
    const middleware = auditLogger();
    middleware(mockReq as Request, mockRes as Response, mockNext);
    
    const finishCallback = (mockRes.on as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'finish'
    )[1];
    
    finishCallback();
    
    const logEntry = JSON.parse(stdoutData.trim());
    expect(logEntry).toMatchObject({
      method: 'GET',
      path: '/test',
      statusCode: 200,
      ip: '192.168.1.1'
    });
    expect(logEntry).toHaveProperty('timestamp');
    expect(logEntry).toHaveProperty('responseTimeMs');
  });
});