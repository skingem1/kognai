import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as crypto from 'crypto';
import { findApiKeyByKey, invalidateApiKey, ApiKey } from '../services/api-keys';

/**
 * Authentication middleware for API key validation
 * Validates API keys from database and attaches customer info to request
 */

// Extend Express Request type to include customer info
declare global {
  namespace Express {
    interface Request {
      customer?: {
        id: string;
        email: string;
        tier: string;
        plan: string;
      };
      apiKey?: ApiKey;
    }
  }
}

/**
 * Standard authentication error messages
 */
export const AUTH_ERRORS = {
  MISSING_API_KEY: {
    code: 'MISSING_API_KEY',
    message: 'API key is required. Please provide a valid API key.',
    statusCode: 401,
  },
  INVALID_API_KEY: {
    code: 'INVALID_API_KEY',
    message: 'Invalid or expired API key.',
    statusCode: 401,
  },
  INACTIVE_API_KEY: {
    code: 'INACTIVE_API_KEY',
    message: 'This API key has been deactivated.',
    statusCode: 401,
  },
  INSUFFICIENT_PERMISSIONS: {
    code: 'INSUFFICIENT_PERMISSIONS',
    message: 'You do not have permission to access this resource.',
    statusCode: 403,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'API key rate limit exceeded.',
    statusCode: 429,
  },
} as const;

/**
 * Zod schema for API key validation
 */
export const apiKeySchema = z.object({
  'x-api-key': z.string().min(32, 'API key too short').max(128, 'API key too long'),
});

/**
 * Extract API key from request headers
 */
export const extractApiKey = (req: Request): string | null => {
  // Check X-API-Key header (case-insensitive)
  const apiKey = req.headers['x-api-key'] as string;
  
  if (apiKey && typeof apiKey === 'string') {
    return apiKey.trim();
  }
  
  // Also check Authorization header for Bearer token format
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  
  return null;
};

/**
 * Validate API key format
 */
export const validateApiKeyFormat = (apiKey: string): boolean => {
  // API keys should be 32-128 characters, alphanumeric with dashes/underscores
  const apiKeyPattern = /^[A-Za-z0-9_-]{32,128}$/;
  return apiKeyPattern.test(apiKey);
};

/**
 * Authenticate request using API key
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract API key
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      res.status(AUTH_ERRORS.MISSING_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.MISSING_API_KEY,
      });
      return;
    }
    
    // Validate API key format before database lookup
    if (!validateApiKeyFormat(apiKey)) {
      console.warn(`Invalid API key format from IP: ${req.ip}`);
      res.status(AUTH_ERRORS.INVALID_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.INVALID_API_KEY,
      });
      return;
    }
    
    // Look up API key in database
    const apiKeyRecord = await findApiKeyByKey(apiKey);
    
    if (!apiKeyRecord) {
      // Log failed authentication attempts
      console.warn(`Invalid API key attempt from IP: ${req.ip}, Key prefix: ${apiKey.substring(0, 8)}...`);
      
      // Add artificial delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      
      res.status(AUTH_ERRORS.INVALID_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.INVALID_API_KEY,
      });
      return;
    }
    
    // Check if API key is active
    if (!apiKeyRecord.isActive) {
      console.warn(`Inactive API key used from IP: ${req.ip}, Key ID: ${apiKeyRecord.id}`);
      res.status(AUTH_ERRORS.INACTIVE_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.INACTIVE_API_KEY,
      });
      return;
    }
    
    // Check if API key has expired
    if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
      console.warn(`Expired API key used from IP: ${req.ip}, Key ID: ${apiKeyRecord.id}`);
      res.status(AUTH_ERRORS.INVALID_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.INVALID_API_KEY,
      });
      return;
    }
    
    // Attach customer and API key info to request
    req.customer = {
      id: apiKeyRecord.customerId,
      email: apiKeyRecord.customerEmail,
      tier: apiKeyRecord.tier,
      plan: apiKeyRecord.plan,
    };
    
    req.apiKey = apiKeyRecord;
    
    // Log successful authentication
    console.debug(`API key authenticated for customer: ${apiKeyRecord.customerId}`);
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during authentication.',
        statusCode: 500,
      },
    });
  }
};

/**
 * Require specific permissions for endpoint
 */
export const requirePermissions = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;
    
    if (!apiKey) {
      res.status(AUTH_ERRORS.MISSING_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.MISSING_API_KEY,
      });
      return;
    }
    
    const permissions = apiKey.permissions || [];
    
    // Check if API key has all required permissions
    const hasAllPermissions = requiredPermissions.every(permission =>
      permissions.includes(permission) || permissions.includes('*')
    );
    
    if (!hasAllPermissions) {
      res.status(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS.statusCode).json({
        success: false,
        error: {
          ...AUTH_ERRORS.INSUFFICIENT_PERMISSIONS,
          required: requiredPermissions,
          granted: permissions,
        },
      });
      return;
    }
    
    next();
  };
};

/**
 * Optional authentication - attaches customer info if valid key provided
 * Does not block request if no key provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      // No API key provided, continue without authentication
      next();
      return;
    }
    
    // If API key provided, validate it
    if (!validateApiKeyFormat(apiKey)) {
      // Invalid format, continue without authentication
      next();
      return;
    }
    
    const apiKeyRecord = await findApiKeyByKey(apiKey);
    
    if (apiKeyRecord && apiKeyRecord.isActive) {
      req.customer = {
        id: apiKeyRecord.customerId,
        email: apiKeyRecord.customerEmail,
        tier: apiKeyRecord.tier,
        plan: apiKeyRecord.plan,
      };
      req.apiKey = apiKeyRecord;
    }
    
    next();
  } catch (error) {
    // On error, continue without authentication
    next();
  }
};

/**
 * Require specific customer tier
 */
export const requireTier = (...allowedTiers: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const customer = req.customer;
    
    if (!customer) {
      res.status(AUTH_ERRORS.MISSING_API_KEY.statusCode).json({
        success: false,
        error: AUTH_ERRORS.MISSING_API_KEY,
      });
      return;
    }
    
    if (!allowedTiers.includes(customer.tier)) {
      res.status(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS.statusCode).json({
        success: false,
        error: {
          ...AUTH_ERRORS.INSUFFICIENT_PERMISSIONS,
          message: `This endpoint requires one of the following tiers: ${allowedTiers.join(', ')}`,
          required: allowedTiers,
          current: customer.tier,
        },
      });
      return;
    }
    
    next();
  };
};

/**
 * Invalidate API key (logout)
 */
export const revokeApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.apiKey;
    
    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_API_KEY',
          message: 'No active API key to revoke.',
        },
      });
      return;
    }
    
    await invalidateApiKey(apiKey.id);
    
    res.json({
      success: true,
      message: 'API key has been revoked.',
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    next(error);
  }
};

export default {
  authenticate,
  optionalAuth,
  requirePermissions,
  requireTier,
  revokeApiKey,
  extractApiKey,
  validateApiKeyFormat,
  AUTH_ERRORS,
};
