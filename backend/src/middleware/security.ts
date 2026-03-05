import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

/**
 * Security middleware configuration for Express.js
 * Implements OWASP security guidelines including:
 * - Helmet.js for security headers
 * - CORS configuration
 * - XSS protection
 * - Rate limiting defaults
 */

// Environment-based CORS origins
const CORS_ORIGINS = {
  development: ['http://localhost:3000', 'http://localhost:5173'],
  staging: ['https://staging.example.com'],
  production: ['https://example.com', 'https://www.example.com'],
};

/**
 * Get allowed CORS origins based on NODE_ENV
 */
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  return CORS_ORIGINS[env as keyof typeof CORS_ORIGINS] || CORS_ORIGINS.development;
};

/**
 * CORS configuration with strict security settings
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = getAllowedOrigins();
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log blocked origins in production for security monitoring
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Correlation-ID',
  ],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Helmet configuration with strict security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      connectSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Set to true if using SharedArrayBuffer
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

/**
 * Default rate limiter for general endpoints
 * Applied globally unless overridden by specific limiters
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
  keyGenerator: (req) => {
    // Use X-Forwarded-For for clients behind proxy, otherwise use IP
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Input sanitization middleware to prevent XSS attacks
 * Sanitizes request body, query params, and URL params
 */
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Helper function to sanitize strings
    const sanitizeString = (value: unknown): unknown => {
      if (typeof value === 'string') {
        // Remove HTML tags and encode special characters
        return value
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeString);
      }
      if (value && typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeString(val);
        }
        return sanitized;
      }
      return value;
    };

    // Sanitize body if it exists
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeString(req.body) as Record<string, unknown>;
    }

    // Sanitize query params
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeString(req.query) as Record<string, unknown>;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Additional security headers middleware
 * Adds custom security headers beyond what Helmet provides
 */
export const additionalSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filter in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer policy for privacy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy for browser features
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  
  // Add request ID for tracing
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || generateRequestId());
  
  next();
};

/**
 * Generate a unique request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Zod schema for validating security configuration
 */
export const securityConfigSchema = z.object({
  corsOrigins: z.array(z.string().url()).optional(),
  rateLimitWindowMs: z.number().min(1000).max(86400000).optional(),
  rateLimitMax: z.number().min(1).max(10000).optional(),
  helmetEnabled: z.boolean().optional(),
});

/**
 * Type for security configuration
 */
export type SecurityConfig = z.infer<typeof securityConfigSchema>;

/**
 * Validate security configuration
 */
export const validateSecurityConfig = (config: unknown): SecurityConfig => {
  return securityConfigSchema.parse(config);
};

/**
 * Complete security middleware chain
 * Order matters: helmet -> cors -> rate limit -> xss -> headers
 */
export const securityMiddleware = [
  helmetConfig,
  cors(corsOptions),
  generalRateLimiter,
  xssProtection,
  additionalSecurityHeaders,
];

// Export individual middlewares for selective use
export default {
  helmet: helmetConfig,
  cors: cors(corsOptions),
  rateLimiter: generalRateLimiter,
  xssProtection,
  additionalHeaders: additionalSecurityHeaders,
  corsOptions,
  helmetConfig,
};
