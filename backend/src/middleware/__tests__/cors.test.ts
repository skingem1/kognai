import { Request, Response, NextFunction } from 'express';
import { corsMiddleware } from '../cors';

describe('corsMiddleware', () => {
  const mockEnd = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ end: mockEnd });
  const mockSetHeader = jest.fn();
  const mockRes = { status: mockStatus, setHeader: mockSetHeader } as unknown as Response;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets origin from request header', () => {
    const req = { headers: { origin: 'https://example.com' }, method: 'GET' } as unknown as Request;
    corsMiddleware(req, mockRes, mockNext);
    expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com');
  });

  it('defaults to * when no origin header', () => {
    const req = { headers: {}, method: 'GET' } as unknown as Request;
    corsMiddleware(req, mockRes, mockNext);
    expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  it('sets all 4 CORS headers correctly', () => {
    const req = { headers: { origin: 'https://example.com' }, method: 'GET' } as unknown as Request;
    corsMiddleware(req, mockRes, mockNext);
    expect(mockSetHeader).toHaveBeenCalledTimes(4);
    expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Key');
    expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
  });

  it('OPTIONS request returns 204 and calls res.end() but NOT next()', () => {
    const req = { headers: {}, method: 'OPTIONS' } as unknown as Request;
    corsMiddleware(req, mockRes, mockNext);
    expect(mockStatus).toHaveBeenCalledWith(204);
    expect(mockEnd).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('non-OPTIONS request calls next() but NOT end()', () => {
    const req = { headers: {}, method: 'GET' } as unknown as Request;
    corsMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockStatus).not.toHaveBeenCalled();
    expect(mockEnd).not.toHaveBeenCalled();
  });
});