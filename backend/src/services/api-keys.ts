import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * API Key Service
 * Handles generation, hashing, validation, and storage of API keys
 */

// Configuration constants
const API_KEY_LENGTH = 32;
const BCRYPT_ROUNDS = 12;
const API_KEY_PREFIX = 'sk_';

/**
 * API Key entity interface
 */
export interface ApiKey {
  id: string;
  customerId: string;
  customerEmail: string;
  keyHash: string;
  keyPrefix: string; // First 8 characters for identification
  name: string;
  tier: string;
  plan: string;
  permissions: string[];
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create API key request schema
 */
export const createApiKeySchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  customerEmail: z.string().email('Valid email is required').optional(),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  tier: z.string().default('free'),
  plan: z.string().default('basic'),
  permissions: z.array(z.string()).default([]),
  expiresInDays: z.number().min(1).max(365).optional(),
});

/**
 * Type for creating API key
 */
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/**
 * API Key response (includes unhashed key for one-time display)
 */
export interface ApiKeyResponse extends ApiKey {
  key?: string; // Only included on creation
}

/**
 * Generate a secure random API key
 */
export const generateApiKey = (): string => {
  const randomBytesBuffer = randomBytes(API_KEY_LENGTH);
  const apiKey = API_KEY_PREFIX + randomBytesBuffer.toString('hex');
  return apiKey;
};

/**
 * Hash an API key using bcrypt
 */
export const hashApiKey = async (apiKey: string): Promise<string> => {
  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(apiKey, salt);
    return hash;
  } catch (error) {
    console.error('Error hashing API key:', error);
    throw new Error('Failed to hash API key');
  }
};

/**
 * Verify an API key against a stored hash
 */
export const verifyApiKey = async (apiKey: string, keyHash: string): Promise<boolean> => {
  try {
    const isValid = await bcrypt.compare(apiKey, keyHash);
    return isValid;
  } catch (error) {
    console.error('Error verifying API key:', error);
    return false;
  }
};

/**
 * Get the prefix of an API key (for identification)
 */
export const getKeyPrefix = (apiKey: string): string => {
  // Return first 8 characters after prefix
  return apiKey.substring(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8);
};

/**
 * Validate API key format
 */
export const validateApiKeyFormat = (apiKey: string): boolean => {
  const pattern = new RegExp(`^${API_KEY_PREFIX}[a-f0-9]{${API_KEY_LENGTH * 2}}$`);
  return pattern.test(apiKey);
};

/**
 * Database interface (to be implemented by the consumer)
 */
export interface ApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  findByCustomerId(customerId: string): Promise<ApiKey[]>;
  findByKeyPrefix(keyPrefix: string): Promise<ApiKey | null>;
  create(data: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiKey>;
  update(id: string, data: Partial<ApiKey>): Promise<ApiKey>;
  delete(id: string): Promise<boolean>;
  rotate(id: string): Promise<ApiKey>;
}

/**
 * In-memory repository for demonstration (replace with actual DB implementation)
 */
class InMemoryApiKeyRepository implements ApiKeyRepository {
  private keys: Map<string, ApiKey> = new Map();

  async findById(id: string): Promise<ApiKey | null> {
    return this.keys.get(id) || null;
  }

  async findByCustomerId(customerId: string): Promise<ApiKey[]> {
    return Array.from(this.keys.values()).filter(key => key.customerId === customerId);
  }

  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey | null> {
    return Array.from(this.keys.values()).find(key => key.keyPrefix === keyPrefix) || null;
  }

  async create(data: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiKey> {
    const id = crypto.randomUUID();
    const now = new Date();
    const apiKey: ApiKey = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.keys.set(id, apiKey);
    return apiKey;
  }

  async update(id: string, data: Partial<ApiKey>): Promise<ApiKey> {
    const existing = this.keys.get(id);
    if (!existing) {
      throw new Error('API key not found');
    }
    const updated: ApiKey = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.keys.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.keys.delete(id);
  }

  async rotate(id: string): Promise<ApiKey> {
    const existing = this.keys.get(id);
    if (!existing) {
      throw new Error('API key not found');
    }
    
    const newKey = generateApiKey();
    const keyHash = await hashApiKey(newKey);
    const keyPrefix = getKeyPrefix(newKey);
    
    return this.update(id, {
      keyHash,
      keyPrefix,
      lastUsedAt: null,
    });
  }
}

// Default repository instance
let apiKeyRepository: ApiKeyRepository = new InMemoryApiKeyRepository();

/**
 * Set custom repository implementation
 */
export const setApiKeyRepository = (repository: ApiKeyRepository): void => {
  apiKeyRepository = repository;
};

/**
 * Get current repository
 */
export const getApiKeyRepository = (): ApiKeyRepository => {
  return apiKeyRepository;
};

/**
 * Create a new API key
 */
export const createApiKey = async (input: CreateApiKeyInput): Promise<ApiKeyResponse> => {
  // Validate input
  const validatedInput = createApiKeySchema.parse(input);
  
  // Generate new API key
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);
  
  // Calculate expiration if specified
  let expiresAt: Date | null = null;
  if (validatedInput.expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validatedInput.expiresInDays);
  }
  
  // Create in database
  const createdKey = await apiKeyRepository.create({
    customerId: validatedInput.customerId,
    customerEmail: validatedInput.customerEmail || `${validatedInput.customerId}@agents.invoica.ai`,
    keyHash,
    keyPrefix,
    name: validatedInput.name,
    tier: validatedInput.tier,
    plan: validatedInput.plan,
    permissions: validatedInput.permissions,
    isActive: true,
    expiresAt,
    lastUsedAt: null,
  });
  
  // Return with the unhashed key (only time it's available)
  return {
    ...createdKey,
    key: apiKey,
  };
};

/**
 * Find API key by ID
 */
export const findApiKeyById = async (id: string): Promise<ApiKey | null> => {
  return apiKeyRepository.findById(id);
};

/**
 * Find API key by the actual key (full lookup)
 */
export const findApiKeyByKey = async (apiKey: string): Promise<ApiKey | null> => {
  // Validate format first
  if (!validateApiKeyFormat(apiKey)) {
    return null;
  }
  
  // Get prefix for initial lookup
  const keyPrefix = getKeyPrefix(apiKey);
  
  // Find by prefix
  const keyWithPrefix = await apiKeyRepository.findByKeyPrefix(keyPrefix);
  if (!keyWithPrefix) {
    return null;
  }
  
  // Verify full key against hash
  const isValid = await verifyApiKey(apiKey, keyWithPrefix.keyHash);
  if (!isValid) {
    return null;
  }
  
  return keyWithPrefix;
};

/**
 * Get all API keys for a customer
 */
export const getCustomerApiKeys = async (customerId: string): Promise<Omit<ApiKey, 'keyHash'>[]> => {
  const keys = await apiKeyRepository.findByCustomerId(customerId);
  return keys.map(({ keyHash, ...rest }) => rest);
};

/**
 * Update API key
 */
export const updateApiKey = async (
  id: string,
  data: Partial<Pick<ApiKey, 'name' | 'permissions' | 'isActive' | 'tier' | 'plan'>>
): Promise<ApiKey> => {
  return apiKeyRepository.update(id, data);
};

/**
 * Invalidate (deactivate) an API key
 */
export const invalidateApiKey = async (id: string): Promise<ApiKey> => {
  return apiKeyRepository.update(id, { isActive: false });
};

/**
 * Delete an API key permanently
 */
export const deleteApiKey = async (id: string): Promise<boolean> => {
  return apiKeyRepository.delete(id);
};

/**
 * Rotate an API key (invalidate old, create new)
 */
export const rotateApiKey = async (id: string): Promise<ApiKeyResponse> => {
  const oldKey = await apiKeyRepository.findById(id);
  if (!oldKey) {
    throw new Error('API key not found');
  }
  
  // Generate new key
  const newApiKey = generateApiKey();
  const keyHash = await hashApiKey(newApiKey);
  const keyPrefix = getKeyPrefix(newApiKey);
  
  // Update in database
  await apiKeyRepository.update(id, {
    keyHash,
    keyPrefix,
    lastUsedAt: null,
  });
  
  return {
    ...(await apiKeyRepository.findById(id))!,
    key: newApiKey,
  };
};

/**
 * Update last used timestamp
 */
export const updateLastUsed = async (id: string): Promise<void> => {
  await apiKeyRepository.update(id, { lastUsedAt: new Date() });
};

/**
 * Validate API key input with Zod
 */
export const validateApiKeyInput = (data: unknown): CreateApiKeyInput => {
  return createApiKeySchema.parse(data);
};

/**
 * Get API key metadata (without sensitive data)
 */
export const getApiKeyMetadata = (apiKey: ApiKey): Omit<ApiKey, 'keyHash'> => {
  const { keyHash, ...metadata } = apiKey;
  return metadata;
};

export default {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  getKeyPrefix,
  validateApiKeyFormat,
  createApiKey,
  findApiKeyById,
  findApiKeyByKey,
  getCustomerApiKeys,
  updateApiKey,
  invalidateApiKey,
  deleteApiKey,
  rotateApiKey,
  updateLastUsed,
  validateApiKeyInput,
  getApiKeyMetadata,
  setApiKeyRepository,
  getApiKeyRepository,
};

// ─── Supabase Repository Bootstrap ─────────────────────────────────────────
// Auto-wire Supabase-backed repository when env vars are available.
// This replaces the in-memory repository at startup.
import { SupabaseApiKeyRepository } from './api-key-repo-supabase';
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  setApiKeyRepository(new SupabaseApiKeyRepository());
}
