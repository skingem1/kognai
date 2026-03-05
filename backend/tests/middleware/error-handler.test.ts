import { Request, Response, NextFunction } from 'express';
import { AppError, createAppError, errorHandler } from '../../src/middleware/error-handler';

// Mock console.error to capture logs
let consoleOutput: string | null = null;
jest.spyOn(console, 'error').mockImplementation((msg) => {
  consoleOutput = typeof msg === 'string' ? msg : JSON.stringify(msg);
});

// Mock Request, Response, NextFunction
const mockReq = { method: 'GET', path: '/test' } as Request;
const mockRes = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response;
const mockNext = jest.fn() as NextFunction;

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleOutput = null;
    process.env.NODE_ENV = 'development';
  });

  it('returns correct JSON for AppError with all properties', () => {
    const error = createAppError('Validation failed', 400, 'VALIDATION_ERROR');
    errorHandler(error, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { message: 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400 },
    });
  });

  it('applies defaults for regular Error without AppError properties', () => {
    const error = new Error('Database connection failed');
    errorHandler(error, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { message: 'Database connection failed', code: 'INTERNAL_SERVER_ERROR', statusCode: 500 },
    });
  });

  it('hides non-operational error message in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Secret internal detail');
    errorHandler(error, mockReq, mockRes, mockNext);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR', statusCode: 500 },
    });
  });

  it('logs error as JSON with all required fields', () => {
    const error = createAppError('Not found', 404, 'NOT_FOUND');
    errorHandler(error, mockReq, mockRes, mockNext);
    const log = JSON.parse(consoleOutput!);
    expect(log.method).toBe('GET');
    expect(log.path).toBe('/test');
    expect(log.statusCode).toBe(404);
    expect(log.message).toBe('Not found');
    expect(log.timestamp).toBeDefined();
  });
});