import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Configuration options for the rate limiter
 */
export interface RateLimiterConfig {
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Maximum number of requests allowed per window (default: 100) */
  maxRequests?: number;
}

/**
 * Internal storage entry for tracking request counts
 */
interface RateLimitEntry {
  /** Number of requests made in the current window */
  count: number;
  /** Timestamp when the window expires */
  resetTime: number;
}

/**
 * In-memory store for rate limit data keyed by client identifier
 */
type RateLimiterStore = Map<string, RateLimitEntry>;

/**
 * Creates a rate limiting middleware for Express that limits requests
 * per API key or IP address.
 * 
 * @param config - Optional configuration object with windowMs and maxRequests
 * @returns Express RequestHandler middleware
 * 
 * @example
 * // Basic usage with defaults (100 requests per minute)
 * const rateLimiter = createRateLimiter();
 * app.use(rateLimiter);
 * 
 * @example
 * // Custom configuration
 * const rateLimiter = createRateLimiter({
 *   windowMs: 60000,
 *   maxRequests: 100
 * });
 * app.use(rateLimiter);
 */
export function createRateLimiter(config?: RateLimiterConfig): RequestHandler {
  const windowMs = config?.windowMs ?? 60000;
  const maxRequests = config?.maxRequests ?? 100;
  
  // In-memory storage for rate limit data
  const store: RateLimiterStore = new Map();
  
  // Cleanup expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime < now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract API key from Authorization header (Bearer token) or x-api-key header
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];
    
    let apiKey: string | undefined;
    
    // Check Authorization header for Bearer token
    if (authHeader) {
      const bearerMatch = authHeader.match(/^Bearer\s+/i);
      if (bearerMatch) {
        apiKey = authHeader.substring(bearerMatch[0].length);
      } else {
        // If no Bearer prefix, treat the whole header as the token
        apiKey = authHeader;
      }
    }
    
    // Check x-api-key header
    if (!apiKey && apiKeyHeader) {
      apiKey = String(apiKeyHeader);
    }
    
    // Fallback to IP address if no API key found
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = apiKey || clientIp;
    
    const now = Date.now();
    const entry = store.get(key);
    
    // Check if we need to reset the window (either new key or expired window)
    if (!entry || entry.resetTime < now) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs
      };
      store.set(key, newEntry);
    } else {
      // Increment the request count for existing valid entry
      entry.count += 1;
    }
    
    const currentEntry = store.get(key)!;
    const remaining = Math.max(0, maxRequests - currentEntry.count);
    const resetTimestamp = Math.ceil(currentEntry.resetTime / 1000);
    
    // Add rate limit headers to response
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTimestamp);
    
    // Check if rate limit exceeded
    if (currentEntry.count > maxRequests) {
      const retryAfter = Math.ceil((currentEntry.resetTime - now) / 1000);
      res.status(429).json({
        error: 'rate_limit_exceeded',
        retryAfter: retryAfter
      });
      return;
    }
    
    next();
  };
}