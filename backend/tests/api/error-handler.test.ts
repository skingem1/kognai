import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler, ApiErrorResponse } from '../../src/api/error-handler';

describe('errorHandler', () => {
  let mockRes: Partial<Response>;
  let mockReq: Partial<Request>;

  beforeEach(() => {
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockReq = {};
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('returns 500 with generic message for unknown errors', () => {
    const err = new Error('Something went wrong');
    errorHandler(err as Error & { statusCode?: number; code?: string }, mockReq as Request, mockRes as Response, {} as NextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 });
  });

  it('returns custom status and message for known errors', () => {
    const err = new Error('Bad request') as Error & { statusCode: number; code: string };
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    errorHandler(err, mockReq as Request, mockRes as Response, {} as NextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Bad request', code: 'BAD_REQUEST', statusCode: 400 });
  });
});

describe('notFoundHandler', () => {
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('returns 404 with NOT_FOUND code', () => {
    notFoundHandler({} as Request, mockRes as Response);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found', code: 'NOT_FOUND', statusCode: 404 });
  });
});