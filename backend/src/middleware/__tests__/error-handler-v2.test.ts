import { Request, Response, NextFunction } from 'express';
import { errorHandlerV2 } from '../error-handler-v2';

describe('error-handler-v2', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('returns 500 for generic Error', () => {
    const err = new Error('Generic error');
    errorHandlerV2(err as any, mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { message: 'Generic error', code: 'INTERNAL_ERROR', statusCode: 500 },
    });
  });

  it('returns custom statusCode when err has statusCode property', () => {
    const err = { statusCode: 400, message: 'Bad request' };
    errorHandlerV2(err as any, mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { message: 'Bad request', code: 'BAD_REQUEST', statusCode: 400 },
    });
  });

  it('response has error.message and error.statusCode fields', () => {
    const err = { statusCode: 404, message: 'Not found' };
    errorHandlerV2(err as any, mockReq as Request, mockRes as Response, mockNext);
    const jsonCall = (mockRes.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error).toHaveProperty('message', 'Not found');
    expect(jsonCall.error).toHaveProperty('statusCode', 404);
  });

  it('does not call next() - error handler is terminal', () => {
    const err = new Error('Terminal');
    errorHandlerV2(err as any, mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });
});