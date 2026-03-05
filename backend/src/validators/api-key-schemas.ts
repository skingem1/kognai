import { z } from 'zod';

/**
 * Valid scope values for API keys
 */
const API_KEY_SCOPES = [
  'invoices:read',
  'invoices:write',
  'settlements:read',
  'webhooks:manage',
  'api-keys:manage',
] as const;

/**
 * Valid status values for API keys
 */
const API_KEY_STATUSES = ['active', 'revoked', 'expired'] as const;

/**
 * Schema for creating a new API key
 * - name: Required string between 1-100 characters
 * - expiresInDays: Optional positive integer up to 365 days
 * - scopes: Optional array of valid scope enums
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'API key name must be at most 100 characters'),
  expiresInDays: z
    .number()
    .int()
    .positive('Expiration days must be a positive number')
    .max(365, 'Expiration cannot exceed 365 days')
    .optional(),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .optional()
    .default([]),
});

/**
 * Schema for querying API keys with pagination and filtering
 * - limit: Number of results (1-100, default 10)
 * - offset: Number of results to skip (default 0)
 * - status: Optional filter by status
 */
export const apiKeyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(API_KEY_STATUSES).optional(),
});

/**
 * Schema for rotating an existing API key
 * - expiresInDays: Optional new expiration period
 */
export const rotateApiKeySchema = z.object({
  expiresInDays: z
    .number()
    .int()
    .positive('Expiration days must be a positive number')
    .max(365, 'Expiration cannot exceed 365 days')
    .optional(),
});

/**
 * Inferred type for createApiKeySchema input
 */
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/**
 * Inferred type for apiKeyQuerySchema input
 */
export type ApiKeyQuery = z.infer<typeof apiKeyQuerySchema>;

/**
 * Inferred type for rotateApiKeySchema input
 */
export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>;