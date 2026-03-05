import requestIdMiddleware, { RequestWithId } from '../request-id';
import { Request, Response, NextFunction } from 'express';

describe('requestIdMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = { setHeader: jest.fn() };
    mockNext = jest.fn();
  });

  it('generates requestId when no x-request-id header', () => {
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);
    const req = mockReq as RequestWithId;
    
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.requestId).toMatch(/^req-\d+-[a-z0-9]{6}$/);
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });

  it('uses existing x-request-id header', () => {
    mockReq.headers = { 'x-request-id': 'existing-id-123' };
    
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);
    
    expect((mockReq as RequestWithId).requestId).toBe('existing-id-123');
  });

  it('generates unique IDs', () => {
    const req1 = { headers: {} };
    const req2 = { headers: {} };
    
    requestIdMiddleware(req1 as Request, mockRes as Response, mockNext);
    requestIdMiddleware(req2 as Request, mockRes as Response, mockNext);
    
    const r1 = req1 as RequestWithId;
    const r2 = req2 as RequestWithId;
    expect(r1.requestId).not.toBe(r2.requestId);
  });
});