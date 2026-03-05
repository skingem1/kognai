import { Request } from 'express';
import { apiVersionMiddleware, getApiVersion } from '../api-version';

describe('apiVersionMiddleware', () => {
  const mockNext = jest.fn();
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockSetHeader = jest.fn();
  const mockRes = { status: mockStatus, setHeader: mockSetHeader } as any;

  beforeEach(() => jest.clearAllMocks());

  it('supports valid version from header', () => {
    const req = { get: jest.fn().mockReturnValue('v1') } as any;
    const middleware = apiVersionMiddleware(['v1', 'v2']);
    middleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.apiVersion).toBe('v1');
    expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v1');
  });

  it('defaults to last supported version when no header', () => {
    const req = { get: jest.fn().mockReturnValue(undefined) } as any;
    const middleware = apiVersionMiddleware(['v1', 'v2']);
    middleware(req, mockRes, mockNext);
    expect(req.apiVersion).toBe('v2');
    expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v2');
  });

  it('rejects unsupported version with error details', () => {
    const req = { get: jest.fn().mockReturnValue('v3') } as any;
    const middleware = apiVersionMiddleware(['v1', 'v2']);
    middleware(req, mockRes, mockNext);
    expect(mockStatus).toHaveBeenCalledWith(400);
    const errorCall = mockJson.mock.calls[0][0];
    expect(errorCall.error.code).toBe('UNSUPPORTED_VERSION');
    expect(errorCall.error.message).toContain('v3');
    expect(errorCall.error.message).toContain('v1');
    expect(errorCall.error.message).toContain('v2');
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockSetHeader).toHaveBeenCalledWith('X-API-Version', 'v3');
  });
});

describe('getApiVersion', () => {
  it('returns apiVersion from request if set', () => {
    const req = { apiVersion: 'v2' } as any;
    expect(getApiVersion(req)).toBe('v2');
  });

  it('returns v1 as default fallback', () => {
    const req = {} as any;
    expect(getApiVersion(req)).toBe('v1');
  });
});