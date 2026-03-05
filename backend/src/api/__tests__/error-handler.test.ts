import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from '../error-handler';

describe('errorHandler', () => {
  const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  const mockReq = {} as Request;
  const mockNext = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('returns custom error with status 400', () => {
    const err = { statusCode: 400, code: 'BAD_REQUEST', message: 'Bad input' } as Error & { statusCode?: number; code?: string };
    errorHandler(err as any, mockReq, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Bad input', code: 'BAD_REQUEST', statusCode: 400 });
  });

  it('preserves 404 error message', () => {
    const err = { statusCode: 404, code: 'NOT_FOUND', message: 'Not found' } as Error & { statusCode?: number; code?: string };
    errorHandler(err as any, mockReq, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found', code: 'NOT_FOUND', statusCode: 404 });
  });

  it('hides message on 500 with plain Error', () => {
    const err = new Error('secret');
    errorHandler(err, mockReq, mockRes as unknown as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 });
  });

  it('hides message on 500 with custom error', () => {
    const err = { statusCode: 500, message: 'DB failed' } as Error & { statusCode?: number; code?: string };
    errorHandler(err as any, mockReq, mockRes as unknown as Response, mockNext);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 });
  });

  it('defaults code to INTERNAL_ERROR when missing', () => {
    const err = { statusCode: 422, message: 'Validation failed' } as Error & { statusCode?: number; code?: string };
    errorHandler(err as any, mockReq, mockRes as unknown as Response, mockNext);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Validation failed', code: 'INTERNAL_ERROR', statusCode: 422 });
  });
});

describe('notFoundHandler', () => {
  const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };

  it('returns 404 with exact error structure', () => {
    notFoundHandler({} as Request, mockRes as unknown as Response);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found', code: 'NOT_FOUND', statusCode: 404 });
  });
});