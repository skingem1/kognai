import { Request, Response, NextFunction } from 'express';
import { authenticate, optionalAuth, requirePermissions, requireTier, extractApiKey, validateApiKeyFormat, AUTH_ERRORS } from '../../src/middleware/auth';
import * as apiKeysService from '../../src/services/api-keys';

// Mock the api-keys service
jest.mock('../../src/services/api-keys');

// Type for mocked service
const mockApiKeysService = apiKeysService as jest.Mocked<typeof apiKeysService>;

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('extractApiKey', () => {
    it('should extract API key from X-API-Key header', () => {
      const req = { headers: { 'x-api-key': 'sk_test1234567890123456789012345678' } } as Request;
      const result = extractApiKey(req);
      expect(result).toBe('sk_test1234567890123456789012345678');
    });

    it('should extract API key from Authorization Bearer header', () => {
      const req = { headers: { authorization: 'Bearer sk_test1234567890123456789012345678' } } as Request;
      const result = extractApiKey(req);
      expect(result).toBe('sk_test1234567890123456789012345678');
    });

    it('should return null when no API key provided', () => {
      const req = { headers: {} } as Request;
      const result = extractApiKey(req);
      expect(result).toBeNull();
    });

    it('should trim whitespace from API key', () => {
      const req = { headers: { 'x-api-key': '  sk_test1234567890123456789012345678  ' } } as Request;
      const result = extractApiKey(req);
      expect(result).toBe('sk_test1234567890123456789012345678');
    });

    it('should return null for invalid authorization header format', () => {
      const req = { headers: { authorization: 'Basic somedata' } } as Request;
      const result = extractApiKey(req);
      expect(result).toBeNull();
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should return true for valid API key format', () => {
      expect(validateApiKeyFormat('sk_test12345678901234567890123456789012')).toBe(true);
    });

    it('should return false for key without prefix', () => {
      expect(validateApiKeyFormat('test12345678901234567890123456789012')).toBe(false);
    });

    it('should return false for key that is too short', () => {
      expect(validateApiKeyFormat('sk_123')).toBe(false);
    });

    it('should return false for key with invalid characters', () => {
      expect(validateApiKeyFormat('sk_test!@#$%^&*()')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateApiKeyFormat('')).toBe(false);
    });
  });

  describe('authenticate', () => {
    const validApiKey = 'sk_test12345678901234567890123456789012';
    const validApiKeyRecord = {
      id: 'key-123',
      customerId: 'customer-456',
      customerEmail: 'test@example.com',
      keyHash: 'hashed_key',
      keyPrefix: 'sk_test12',
      name: 'Test Key',
      tier: 'premium',
      plan: 'basic',
      permissions: ['read', 'write'],
      isActive: true,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return 401 when no API key provided', async () => {
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_ERRORS.MISSING_API_KEY,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when API key format is invalid', async () => {
      mockReq.headers = { 'x-api-key': 'invalid-key' };
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_ERRORS.INVALID_API_KEY,
      });
    });

    it('should return 401 when API key not found in database', async () => {
      mockReq.headers = { 'x-api-key': validApiKey };
      mockApiKeysService.findApiKeyByKey.mockResolvedValue(null);
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_ERRORS.INVALID_API_KEY,
      });
    });

    it('should return 401 when API key is inactive', async () => {
      mockReq.headers = { 'x-api-key': validApiKey };
      mockApiKeysService.findApiKeyByKey.mockResolvedValue({
        ...validApiKeyRecord,
        isActive: false,
      });
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: AUTH_ERRORS.INACTIVE_API_KEY,
      });
    });

    it('should return 401 when API key is expired', async () => {
      mockReq.headers = { 'x-api-key': validApiKey };
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);
      
      mockApiKeysService.findApiKeyByKey.mockResolvedValue({
        ...validApiKeyRecord,
        expiresAt: expiredDate,
      });
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should call next() and attach customer info for valid API key', async () => {
      mockReq.headers = { 'x-api-key': validApiKey };
      mockApiKeysService.findApiKeyByKey.mockResolvedValue(validApiKeyRecord);
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).customer).toEqual({
        id: validApiKeyRecord.customerId,
        email: validApiKeyRecord.customerEmail,
        tier: validApiKeyRecord.tier,
        plan: validApiKeyRecord.plan,
      });
      expect((mockReq as any).apiKey).toEqual(validApiKeyRecord);
    });

    it('should handle database errors gracefully', async () => {
      mockReq.headers = { 'x-api-key': validApiKey };
      mockApiKeysService.findApiKeyByKey.mockRejectedValue(new Error('Database error'));
      
      await authenticate(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during authentication.',
          statusCode: 500,
        },
      });
    });
  });

  describe('optionalAuth', () => {
    it('should call next() without authentication when no key provided', async () => {
      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).customer).toBeUndefined();
    });

    it('should attach customer info when valid key provided', async () => {
      const validApiKeyRecord = {
        id: 'key-123',
        customerId: 'customer-456',
        customerEmail: 'test@example.com',
        keyHash: 'hashed_key',
        keyPrefix: 'sk_test12',
        name: 'Test Key',
        tier: 'premium',
        plan: 'basic',
        permissions: ['read'],
        isActive: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      mockReq.headers = { 'x-api-key': 'sk_test12345678901234567890123456789012' };
      mockApiKeysService.findApiKeyByKey.mockResolvedValue(validApiKeyRecord);
      
      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).customer).toBeDefined();
    });

    it('should continue without authentication when key is invalid', async () => {
      mockReq.headers = { 'x-api-key': 'invalid-key' };
      
      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).customer).toBeUndefined();
    });
  });

  describe('requirePermissions', () => {
    it('should call next() when API key has required permissions', () => {
      const middleware = requirePermissions('read', 'write');
      (mockReq as any).apiKey = {
        permissions: ['read', 'write', 'delete'],
      };
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when API key lacks required permissions', () => {
      const middleware = requirePermissions('read', 'admin');
      (mockReq as any).apiKey = {
        permissions: ['read'],
      };
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when no API key attached', () => {
      const middleware = requirePermissions('read');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow wildcard permission', () => {
      const middleware = requirePermissions('admin');
      (mockReq as any).apiKey = {
        permissions: ['*'],
      };
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireTier', () => {
    it('should call next() when customer has required tier', () => {
      const middleware = requireTier('premium', 'enterprise');
      (mockReq as any).customer = {
        id: 'customer-123',
        email: 'test@example.com',
        tier: 'premium',
        plan: 'basic',
      };
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when customer tier is not allowed', () => {
      const middleware = requireTier('premium', 'enterprise');
      (mockReq as any).customer = {
        id: 'customer-123',
        email: 'test@example.com',
        tier: 'free',
        plan: 'basic',
      };
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when no customer attached', () => {
      const middleware = requireTier('premium');
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });
});
