import { type Request, type Response, type NextFunction } from 'express';
import { requestId, getRequestId } from '../../src/middleware/request-id';

describe('requestId middleware', () => {
  const mockReq = { headers: {} } as unknown as Request;
  const mockRes = { setHeader: jest.fn() } as unknown as Response;
  const mockNext = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('uses existing X-Request-Id header', () => {
    mockReq.headers['x-request-id'] = 'existing-id';
    requestId()(mockReq, mockRes, mockNext);
    expect(mockReq.headers['x-request-id']).toBe('existing-id');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
    expect(mockNext).toHaveBeenCalled();
  });

  it('generates new UUID when header missing', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    requestId()(mockReq, mockRes, mockNext);
    expect(mockReq.headers['x-request-id']).toMatch(uuidRegex);
    expect(mockNext).toHaveBeenCalled();
  });

  it('generates new UUID when header empty', () => {
    mockReq.headers['x-request-id'] = '';
    requestId()(mockReq, mockRes, mockNext);
    expect((mockReq.headers['x-request-id'] as string).length).toBeGreaterThan(0);
    expect(mockNext).toHaveBeenCalled();
  });

  it('getRequestId returns header value', () => {
    mockReq.headers['x-request-id'] = 'test-id';
    expect(getRequestId(mockReq)).toBe('test-id');
  });

  it('getRequestId returns unknown when header missing', () => {
    mockReq.headers = {};
    expect(getRequestId(mockReq)).toBe('unknown');
  });
});