import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { z } from 'zod';
import { promisify } from 'util';

/**
 * Rate limiting middleware with Redis backend
 * Supports per-customer and per-IP rate limiting with multiple tiers
 */

// Redis client instance
let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis client for rate limiting
 */
export const initRateLimitRedis = async (redisUrl?: string): Promise<RedisClientType> => {
  const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis rate limit error:', err);
    });

    redisClient.on('connect', () => {
      console.info('Redis rate limiter connected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis for rate limiting:', error);
    throw error;
  }
};

/**
 * Get Redis client instance
 */
export const getRedisClient = (): RedisClientType | null => {
  return redisClient;
};

/**
 * Close Redis connection
 */
export const closeRateLimitRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

/**
 * Customer tier configurations
 */
export enum CustomerTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

/**
 * Rate limit configuration by tier
 */
export const tierConfigs: Record<CustomerTier, { windowMs: number; max: number }> = {
  [CustomerTier.FREE]: { windowMs: 15 * 60 * 1000, max: 100 },      // 100 requests per 15 min
  [CustomerTier.BASIC]: { windowMs: 15 * 60 * 1000, max: 1000 },    // 1000 requests per 15 min
  [CustomerTier.PREMIUM]: { windowMs: 15 * 60 * 1000, max: 5000 },  // 5000 requests per 15 min
  [CustomerTier.ENTERPRISE]: { windowMs: 15 * 60 * 1000, max: 10000 }, // 10000 requests per 15 min
};

/**
 * Zod schema for rate limit options
 */
export const rateLimitOptionsSchema = z.object({
  windowMs: z.number().min(1000).max(86400000).optional(),
  max: z.number().min(1).max(100000).optional(),
  keyPrefix: z.string().min(1).max(100).optional(),
  skipSuccessfulRequests: z.boolean().optional(),
  skipFailedRequests: z.boolean().optional(),
  skip: z.function().optional(),
  handler: z.function().optional(),
  validate: z.boolean().optional(),
});

/**
 * Type for rate limit options
 */
export type RateLimitOptions = z.infer<typeof rateLimitOptionsSchema>;

/**
 * Generate rate limit key based on customer and IP
 * Format: rate_limit:{customerId}:{ip}
 */
export const generateRateLimitKey = (
  req: Request,
  customerId?: string
): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const sanitizedIp = ip.replace(/:/g, '_');
  
  if (customerId) {
    return `rate_limit:${customerId}:${sanitizedIp}`;
  }
  
  return `rate_limit:ip:${sanitizedIp}`;
};

/**
 * Custom store for Redis-backed rate limiting
 */
class RedisRateLimitStore {
  private client: RedisClientType;
  private windowMs: number;
  private prefix: string;

  constructor(options: { client: RedisClientType; windowMs: number; prefix: string }) {
    this.client = options.client;
    this.windowMs = options.windowMs;
    this.prefix = options.prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: number; flatResetTime: number }> {
    const redisKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Use Redis transaction for atomic operations
    const multi = this.client.multi();
    
    // Remove old entries outside the window
    multi.zRemRangeByScore(redisKey, 0, windowStart);
    
    // Add current request
    multi.zAdd(redisKey, { score: now, value: now.toString() });
    
    // Set expiry
    multi.expire(redisKey, Math.ceil(this.windowMs / 1000));
    
    // Get count
    multi.zCard(redisKey);
    
    const results = await multi.exec();
    const totalHits = results?.[3] || 1;
    
    // Calculate reset time
    const resetTime = now + this.windowMs;
    const flatResetTime = Math.floor(resetTime / 1000);

    return {
      totalHits,
      resetTime,
      flatResetTime,
    };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    const now = Date.now();
    
    await this.client.zAdd(redisKey, { score: now, value: `dec_${now}` });
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    await this.client.del(redisKey);
  }

  async getKey(key: string): Promise<{ totalHits: number; resetTime: number } | undefined> {
    const redisKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old entries
    await this.client.zRemRangeByScore(redisKey, 0, windowStart);
    
    const count = await this.client.zCard(redisKey);
    
    if (count === 0) {
      return undefined;
    }

    return {
      totalHits: count,
      resetTime: now + this.windowMs,
    };
  }
}

/**
 * Create Redis-backed rate limiter
 */
export const createRateLimiter = (
  options: RateLimitOptions & { customerTier?: CustomerTier }
) => {
  const tier = options.customerTier || CustomerTier.FREE;
  const tierConfig = tierConfigs[tier];
  
  const windowMs = options.windowMs || tierConfig.windowMs;
  const max = options.max || tierConfig.max;
  const prefix = options.keyPrefix || 'rl';

  // Build store options
  const storeOptions = {
    client: redisClient!,
    windowMs,
    prefix,
  };

  // Create limiter
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => generateRateLimitKey(req, (req as any).customerId),
    skip: options.skip,
    handler: (req, res, next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.set('Retry-After', retryAfter.toString());
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP/customer, please try again later.',
          retryAfter,
        },
      });
    },
    validate: options.validate !== false,
    standardHeaders: true,
    legacyHeaders: false,
    // Use custom Redis store if available
    ...(redisClient ? { store: new RedisRateLimitStore(storeOptions) } : {}),
  });
};

/**
 * Pre-configured rate limiters for different tiers
 */
export const rateLimiters: Record<CustomerTier, ReturnType<typeof createRateLimiter>> = {
  [CustomerTier.FREE]: createRateLimiter({ customerTier: CustomerTier.FREE }),
  [CustomerTier.BASIC]: createRateLimiter({ customerTier: CustomerTier.BASIC }),
  [CustomerTier.PREMIUM]: createRateLimiter({ customerTier: CustomerTier.PREMIUM }),
  [CustomerTier.ENTERPRISE]: createRateLimiter({ customerTier: CustomerTier.ENTERPRISE }),
};

/**
 * Middleware to select rate limiter based on customer tier
 */
export const tierBasedRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const customer = (req as any).customer;
  const tier = customer?.tier || CustomerTier.FREE;
  
  // Use appropriate rate limiter based on tier
  const limiter = rateLimiters[tier];
  limiter(req, res, next);
};

/**
 * IP-only rate limiter for unauthenticated endpoints
 */
export const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => `rl:ip:${req.ip || req.socket.remoteAddress || 'unknown'}`,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP.',
      },
    });
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `rl:auth:${req.ip || req.socket.remoteAddress || 'unknown'}`,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later.',
      },
    });
  },
});

/**
 * Get current rate limit status for a customer/IP
 */
export const getRateLimitStatus = async (
  customerId?: string,
  ip?: string
): Promise<{
  remaining: number;
  limit: number;
  reset: number;
}> => {
  if (!redisClient) {
    return { remaining: -1, limit: -1, reset: -1 };
  }

  const key = customerId ? `rate_limit:${customerId}:${ip}` : `rate_limit:ip:${ip}`;
  const store = new RedisRateLimitStore({
    client: redisClient,
    windowMs: 60000,
    prefix: 'rl',
  });

  const result = await store.getKey(key);
  
  if (!result) {
    return { remaining: 100, limit: 100, reset: Date.now() + 60000 };
  }

  return {
    remaining: Math.max(0, 100 - result.totalHits),
    limit: 100,
    reset: result.resetTime,
  };
};

/**
 * Reset rate limit for a customer
 */
export const resetCustomerRateLimit = async (customerId: string): Promise<void> => {
  if (!redisClient) {
    return;
  }

  const keys = await redisClient.keys(`rate_limit:${customerId}:*`);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
};

export default {
  initRateLimitRedis,
  getRedisClient,
  closeRateLimitRedis,
  createRateLimiter,
  tierBasedRateLimiter,
  ipRateLimiter,
  authRateLimiter,
  getRateLimitStatus,
  resetCustomerRateLimit,
  rateLimiters,
  CustomerTier,
  tierConfigs,
};
