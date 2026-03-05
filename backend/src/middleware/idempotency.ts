import { Request, Response, NextFunction, RequestHandler } from 'express';

interface CachedResponse {
  statusCode: number;
  body: unknown;
  createdAt: number;
}

const responseCache = new Map<string, CachedResponse>();

const CACHE_TTL = 86400000; // 24 hours in ms

/**
 * Extracts idempotency key from request headers
 * @param req - Express request object
 * @returns The idempotency key string or undefined if not present
 */
export function getIdempotencyKey(req: Request): string | undefined {
  const key = req.headers['idempotency-key'];
  if (typeof key === 'string') {
    return key;
  }
  if (Array.isArray(key) && key.length > 0) {
    return key[0];
  }
  return undefined;
}

/**
 * Express middleware for handling idempotent POST requests
 * Caches responses based on idempotency key to prevent duplicate processing
 */
export function idempotencyMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const idempotencyKey = getIdempotencyKey(req);

    // Skip if no idempotency key present
    if (!idempotencyKey) {
      return next();
    }

    const now = Date.now();

    // Clean expired entries on each request
    for (const [cachedKey, cachedValue] of responseCache.entries()) {
      if (now - cachedValue.createdAt > CACHE_TTL) {
        responseCache.delete(cachedKey);
      }
    }

    // Cache hit: return cached response immediately
    const cached = responseCache.get(idempotencyKey);
    if (cached) {
      return res.status(cached.statusCode).json(cached.body);
    }

    // Cache miss: wrap res.json to capture and cache the response
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
      const responseData: CachedResponse = {
        statusCode: res.statusCode,
        body,
        createdAt: now,
      };
      responseCache.set(idempotencyKey, responseData);
      return originalJson(body);
    };

    return next();
  };
}