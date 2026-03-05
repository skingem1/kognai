import { Request, Response, NextFunction } from 'express';
import { additionalSecurityHeaders } from '../security';

describe('security/headers', () => {
  let mockReq: { headers: Record<string, string> };
  let mockRes: { setHeader: jest.Mock };
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = { setHeader: jest.fn() };
    mockNext = jest.fn();
  });

  it('sets X-Frame-Options to DENY', () => {
    additionalSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('sets X-Content-Type-Options to nosniff', () => {
    additionalSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('uses existing X-Request-ID from request headers', () => {
    mockReq.headers['x-request-id'] = 'custom-id';
    additionalSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'custom-id');
  });

  it('generates X-Request-ID starting with req_ when not provided', () => {
    additionalSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);
    const [, id] = mockRes.setHeader.mock.calls.find((c: string[]) => c[0] === 'X-Request-ID') || [];
    expect(id).toMatch(/^req_/);
  });

  it('calls next()', () => {
    additionalSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});