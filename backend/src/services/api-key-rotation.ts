import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

/**
 * ApiKey interface representing an API key record
 */
export interface ApiKey {
  id: string;
  userId: string;
  prefix: string;
  lastFour: string;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

/**
 * Response type for rotateKey method
 */
export interface RotateKeyResponse {
  newKey: string;
  newKeyId: string;
  expiresOldKeyAt: Date;
}

/**
 * Custom error class for API key rotation service errors
 */
export class ApiKeyRotationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ApiKeyRotationError';
  }
}

/**
 * Service for managing API key rotation, revocation, and listing
 */
export class ApiKeyRotationService {
  private supabase: SupabaseClient;

  /**
   * Creates a new ApiKeyRotationService instance
   * @param supabaseClient - Optional Supabase client. If not provided, will attempt to use the lib/supabase.ts client
   */
  constructor(supabaseClient?: SupabaseClient) {
    if (supabaseClient) {
      this.supabase = supabaseClient;
    } else {
      // Dynamically import to avoid circular dependencies
      const { supabase: defaultSupabase } = require('../lib/supabase');
      this.supabase = defaultSupabase;
    }
  }

  /**
   * Generates a secure random API key
   * Format: 'ik_live_' + 32 random hex characters (64 hex chars = 32 bytes)
   * @returns Generated API key string
   */
  private generateApiKey(): string {
    const randomHex = randomBytes(32).toString('hex');
    return `ik_live_${randomHex}`;
  }

  /**
   * Extracts the last 4 characters from an API key
   * @param apiKey - The full API key
   * @returns Last 4 characters
   */
  private getLastFour(apiKey: string): string {
    return apiKey.slice(-4);
  }

  /**
   * Extracts the prefix from an API key (everything before the random portion)
   * @param apiKey - The full API key
   * @returns Prefix string
   */
  private getPrefix(apiKey: string): string {
    // For 'ik_live_xxxx...', prefix is 'ik_live_'
    const parts = apiKey.split('_');
    if (parts.length >= 2) {
      return `${parts[0]}_${parts[1]}_`;
    }
    return apiKey.substring(0, 8);
  }

  /**
   * Rotates an API key by generating a new one and setting the old one's expiry
   * @param oldKeyId - The ID of the key to rotate
   * @param userId - The ID of the user who owns the key
   * @returns Object containing the new key, key ID, and when the old key expires
   * @throws ApiKeyRotationError if key not found or user doesn't own the key
   */
  async rotateKey(oldKeyId: string, userId: string): Promise<RotateKeyResponse> {
    // Validate inputs
    if (!oldKeyId || typeof oldKeyId !== 'string') {
      throw new ApiKeyRotationError(
        'Invalid key ID provided',
        'INVALID_KEY_ID',
        400
      );
    }

    if (!userId || typeof userId !== 'string') {
      throw new ApiKeyRotationError(
        'Invalid user ID provided',
        'INVALID_USER_ID',
        400
      );
    }

    // First, verify the old key exists and belongs to the user
    const { data: existingKey, error: fetchError } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('id', oldKeyId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (fetchError || !existingKey) {
      throw new ApiKeyRotationError(
        'API key not found or does not belong to user',
        'KEY_NOT_FOUND',
        404
      );
    }

    // Generate new API key
    const newApiKey = this.generateApiKey();
    const newPrefix = this.getPrefix(newApiKey);
    const newLastFour = this.getLastFour(newApiKey);

    // Calculate expiry for old key (now + 24 hours)
    const expiresOldKeyAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Start a transaction-like operation
    // Insert the new key
    const { data: newKeyRecord, error: insertError } = await this.supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        key_hash: this.hashKey(newApiKey), // Store hash, not plain key
        prefix: newPrefix,
        last_four: newLastFour,
        is_active: true,
        created_at: new Date().toISOString(),
        expires_at: null, // New keys don't expire by default
      })
      .select()
      .single();

    if (insertError) {
      throw new ApiKeyRotationError(
        `Failed to create new API key: ${insertError.message}`,
        'INSERT_FAILED',
        500
      );
    }

    // Update old key to set expiry (grace period of 24 hours)
    const { error: updateError } = await this.supabase
      .from('api_keys')
      .update({
        expires_at: expiresOldKeyAt.toISOString(),
        is_active: false,
      })
      .eq('id', oldKeyId);

    if (updateError) {
      // Log error but don't fail - the new key was created successfully
      console.error('Failed to set expiry on old API key:', updateError);
    }

    return {
      newKey: newApiKey,
      newKeyId: newKeyRecord.id,
      expiresOldKeyAt,
    };
  }

  /**
   * Revokes an API key by setting is_active to false
   * @param keyId - The ID of the key to revoke
   * @param userId - The ID of the user who owns the key
   * @throws ApiKeyRotationError if key not found or user doesn't own the key
   */
  async revokeKey(keyId: string, userId: string): Promise<void> {
    // Validate inputs
    if (!keyId || typeof keyId !== 'string') {
      throw new ApiKeyRotationError(
        'Invalid key ID provided',
        'INVALID_KEY_ID',
        400
      );
    }

    if (!userId || typeof userId !== 'string') {
      throw new ApiKeyRotationError(
        'Invalid user ID provided',
        'INVALID_USER_ID',
        400
      );
    }

    // Verify the key exists and belongs to the user
    const { data: existingKey, error: fetchError } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingKey) {
      throw new ApiKeyRotationError(
        'API key not found or does not belong to user',
        'KEY_NOT_FOUND',
        404
      );
    }

    // Check if already inactive
    if (!existingKey.is_active) {
      throw new ApiKeyRotationError(
        'API key is already revoked',
        'KEY_ALREADY_REVOKED',
        400
      );
    }

    // Revoke the key
    const { error: updateError } = await this.supabase
      .from('api_keys')
      .update({
        is_active: false,
        expires_at: new Date().toISOString(), // Set expiry to now
      })
      .eq('id', keyId);

    if (updateError) {
      throw new ApiKeyRotationError(
        `Failed to revoke API key: ${updateError.message}`,
        'REVOKE_FAILED',
        500
      );
    }
  }

  /**
   * Lists all active API keys for a user
   * Note: Never returns the raw key value, only prefix + last 4 characters
   * @param userId - The ID of the user
   * @returns Array of ApiKey objects (sanitized)
   * @throws ApiKeyRotationError if userId is invalid
   */
  async listKeys(userId: string): Promise<ApiKey[]> {
    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new ApiKeyRotationError(
        'Invalid user ID provided',
        'INVALID_USER_ID',
        400
      );
    }

    // Fetch all keys for the user (both active and inactive within grace period)
    // We include inactive keys that haven't expired yet (grace period)
    const now = new Date().toISOString();
    const { data: keys, error: fetchError } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .or('is_active.eq.true,expires_at.gt.' + now)
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new ApiKeyRotationError(
        `Failed to fetch API keys: ${fetchError.message}`,
        'FETCH_FAILED',
        500
      );
    }

    // Map to ApiKey interface (sanitized - no raw key)
    return (keys || []).map((key) => ({
      id: key.id,
      userId: key.user_id,
      prefix: key.prefix,
      lastFour: key.last_four,
      createdAt: new Date(key.created_at),
      expiresAt: key.expires_at ? new Date(key.expires_at) : null,
      isActive: key.is_active,
    }));
  }

  /**
   * Hashes an API key for secure storage
   * In production, this should use a proper hashing algorithm like bcrypt or argon2
   * For now, we use a simple SHA-256 hash (in production, use proper key derivation)
   * @param apiKey - The plain API key
   * @returns Hashed key string
   */
  private hashKey(apiKey: string): string {
    // In production, use a proper cryptographic hashing library
    // This is a placeholder - replace with proper key hashing
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}

export default ApiKeyRotationService;
