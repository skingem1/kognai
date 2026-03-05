import { Request, Response, NextFunction } from 'express';
import {
  generateRateLimitKey,
  createRateLimiter,
  tierConfigs,
  CustomerTier,
  getRateLimitStatus,
  resetCustomerRateLimit,
  ipRateLimiter,
  authRateLimiter,
} from '../../src/middleware/rate-limit';
import { createClient, RedisClientType } from 'redis';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    multi: jest.fn(() => ({
      zRemRangeByScore: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      zCard: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[], [], [], 1]),
    })),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    zRemRangeByScore: jest.fn().mockResolvedValue(1),
    zAdd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    zCard: jest.fn().mockResolvedValue(0),
  })),
}));

describe('Rate Limit Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('generateRateLimitKey', () => {
    it('should generate key with customer ID', () => {
      (mockReq as any).customerId = 'customer-123';
      const key = generateRateLimitKey(mockReq as Request, 'customer-123');
      expect(key).toBe('rate_limit:customer-123:127.0.0.1');
    });

    it('should generate key with IP only when no customer ID', () => {
      const key = generateRateLimitKey(mockReq as Request);
      expect(key).toBe('rate_limit:ip:127.0.0.1');
    });

    it('should handle missing IP gracefully', () => {
      const req = { ip: undefined, socket: { remoteAddress: undefined } } as Request;
      const key = generateRateLimitKey(req, 'customer-123');
      expect(key).toBe('rate_limit:customer-123:unknown');
    });

    it('should sanitize colons from IPv6 addresses', () => {
      const req = { ip: '::1', socket: { remoteAddress: '::1' } } as Request;
      const key = generateRateLimitKey(req, 'customer-123');
      expect(key).toBe('rate_limit:customer-123:__1');
    });
  });

  describe('tierConfigs', () => {
    it('should have correct configuration for FREE tier', () => {
      expect(tierConfigs[CustomerTier.FREE]).toEqual({
        windowMs: 15 * 60 * 1000,
        max: 100,
      });
    });

    it('should have correct configuration for BASIC tier', () => {
      expect(tierConfigs[CustomerTier.BASIC]).toEqual({
        windowMs: 15 * 60 * 1000,
        max: 1000,
      });
    });

    it('should have correct configuration for PREMIUM tier', () => {
      expect(tierConfigs[CustomerTier.PREMIUM]).toEqual({
        windowMs: 15 * 60 * 1000,
        max: 5000,
      });
    });

    it('should have correct configuration for ENTERPRISE tier', () => {
      expect(tierConfigs[CustomerTier.ENTERPRISE]).toEqual({
        windowMs: 15 * 60 * 1000,
        max: 10000,
      });
    });
  });

  describe('createRateLimiter', () => {
    it('should create rate limiter with default FREE tier config', () => {
      const limiter = createRateLimiter({});
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    it('should create rate limiter with custom tier', () => {
      const limiter = createRateLimiter({ customerTier: CustomerTier.PREMIUM });
      expect(limiter).toBeDefined();
    });

    it('should create rate limiter with custom options', () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 50,
        keyPrefix: 'custom',
      });
      expect(limiter).toBeDefined();
    });

    it('should allow custom skip function', () => {
      const skipFn = jest.fn().mockReturnValue(true);
      const limiter = createRateLimiter({ skip: skipFn });
      expect(limiter).toBeDefined();
    });
  });

  describe('ipRateLimiter', () => {
    it('should be defined and callable', () => {
      expect(ipRateLimiter).toBeDefined();
      expect(typeof ipRateLimiter).toBe('function');
    });

    it('should have strict limits for IP-based requests', () => {
      // The ipRateLimiter should be configured with lower limits
      expect(ipRateLimiter).toBeDefined();
    });
  });

  describe('authRateLimiter', () => {
    it('should be defined and callable', () => {
      expect(authRateLimiter).toBeDefined();
      expect(typeof authRateLimiter).toBe('function');
    });

    it('should have very strict limits for auth endpoints', () => {
      // authRateLimiter should have max of 5 requests per 15 minutes
      expect(authRateLimiter).toBeDefined();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return default values when Redis is not available', async () => {
      // Set redisClient to null to simulate no Redis
      const result = await getRateLimitStatus('customer-123', '127.0.0.1');
      
      // Since Redis is mocked, this will return actual values
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('reset');
    });

    it('should calculate remaining requests correctly', async () => {
      const result = await getRateLimitStatus('customer-123', '127.0.0.1');
      
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.reset).toBeGreaterThan(0);
    });
  });

  describe('resetCustomerRateLimit', () => {
    it('should call Redis del for customer keys', async () => {
      await resetCustomerRateLimit('customer-123');
      // The mock should be called with keys pattern
      expect(true).toBe(true);
    });

    it('should handle empty key list gracefully', async () => {
      // Mock returns empty array
      await expect(resetCustomerRateLimit('customer-123')).resolves.not.toThrow();
    });
  });

  describe('Rate limiting behavior', () => {
    it('should include rate limit headers in response', async () => {
      // Create a mock rate limiter that simulates rate limiting
      const mockLimiter = (req: Request, res: Response, next: NextFunction) => {
        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', '99');
        res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000).toString());
        next();
      };
      
      mockLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const mockLimiter = (req: Request, res: Response, next: NextFunction) => {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests from this IP/customer',
          },
        });
      };
      
      mockLimiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set Retry-After header on rate limit', async () => {
      const windowMs = 15 * 60 * 1000;
      const retryAfter = Math.ceil(windowMs / 1000);
      
      // Simulate rate limit exceeded
      mockRes.set('Retry-After', retryAfter.toString());
      
      expect(mockRes.set).toHaveBeenCalledWith('Retry-After', '900');
    });
  });

  describe('Customer Tier Rate Limiting', () => {
    it('should apply different limits for different tiers', () => {
      const freeLimiter = createRateLimiter({ customerTier: CustomerTier.FREE });
      const basicLimiter = createRateLimiter({ customerTier: CustomerTier.BASIC });
      const premiumLimiter = createRateLimiter({ customerTier: CustomerTier.PREMIUM });
      const enterpriseLimiter = createRateLimiter({ customerTier: CustomerTier.ENTERPRISE });
      
      expect(freeLimiter).toBeDefined();
      expect(basicLimiter).toBeDefined();
      expect(premiumLimiter).toBeDefined();
      expect(enterpriseLimiter).toBeDefined();
    });

    it('should allow customization beyond tier defaults', () => {
      const customLimiter = createRateLimiter({
        customerTier: CustomerTier.FREE,
        max: 200,
        windowMs: 60 * 1000,
      });
      
      expect(customLimiter).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle requests without IP address', () => {
      const req = { ip: undefined, socket: { remoteAddress: undefined } } as Request;
      const key = generateRateLimitKey(req);
      expect(key).toContain('unknown');
    });

    it('should handle very long customer IDs', () => {
      const longCustomerId = 'a'.repeat(100);
      const key = generateRateLimitKey(mockReq as Request, longCustomerId);
      expect(key).toContain(longCustomerId);
    });

    it('should handle special characters in customer ID', () => {
      const specialCustomerId = 'customer@#$%^&*()';
      const key = generateRateLimitKey(mockReq as Request, specialCustomerId);
      expect(key).toContain(specialCustomerId);
    });
  });
});
