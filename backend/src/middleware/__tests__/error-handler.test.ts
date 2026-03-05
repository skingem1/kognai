import { createAppError, errorHandler } from '../error-handler';

describe('error-handler', () => {
  const mockReq = { method: 'GET', path: '/test' };
  const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
  const mockNext = jest.fn();

  it('createAppError returns Error with statusCode, code, isOperational', () => {
    const err = createAppError('Test', 400, 'BAD_REQUEST');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.isOperational).toBe(true);
  });

  it('createAppError sets isOperational to true', () => {
    expect(createAppError('Test', 500, 'ERR').isOperational).toBe(true);
  });

  it('errorHandler returns 500 for generic Error', () => {
    const res = mockRes();
    errorHandler(new Error('Generic'), mockReq as any, res as any, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('errorHandler returns custom statusCode from AppError', () => {
    const res = mockRes();
    const appErr = createAppError('Bad', 401, 'UNAUTHORIZED');
    errorHandler(appErr, mockReq as any, res as any, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('errorHandler response has error.message and error.code fields', () => {
    const res = mockRes();
    errorHandler(new Error('Fail'), mockReq as any, res as any, mockNext);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'Fail', code: 'INTERNAL_SERVER_ERROR' }) })
    );
  });
});