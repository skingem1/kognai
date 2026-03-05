import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { z } from 'zod';

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  revoked: boolean;
}

const ApiKeySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  key_hash: z.string().hex(),
  name: z.string().min(1).max(255),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  last_used_at: z.string().datetime().optional(),
  revoked: z.boolean(),
});

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseKey!);

const API_KEY_PREFIX = 'inv_';
const KEY_LENGTH = 32;

/**
 * Generates a new API key for a user with the given name and optional expiration.
 * @param userId - The UUID of the user creating the key
 * @param name - Descriptive name for the API key
 * @param expiresInDays - Optional number of days until the key expires
 * @returns Object containing the plaintext key (only visible now) and the database record
 */
export async function generateApiKey(
  userId: string,
  name: string,
  expiresInDays?: number
): Promise<{ key: string; api_key_record: ApiKey }> {
  const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(KEY_LENGTH).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ user_id: userId, key_hash: keyHash, name, expires_at: expiresAt, revoked: false })
    .select()
    .single();

  if (error) throw new Error(`Failed to generate API key: ${error.message}`);
  const parsed = ApiKeySchema.parse(data);
  return { key: rawKey, api_key_record: parsed };
}

/**
 * Validates an API key by hashing it and looking up in the database.
 * @param key - The plaintext API key to validate
 * @returns The ApiKey record if valid and not expired/revoked, null otherwise
 */
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) return null;
  const parsed = ApiKeySchema.parse(data);
  if (parsed.revoked || (parsed.expires_at && new Date(parsed.expires_at) < new Date())) {
    return null;
  }

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', parsed.id);
  return parsed;
}

/**
 * Revokes an API key by setting its revoked flag to true.
 * @param keyId - The UUID of the API key to revoke
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  const { error } = await supabase.from('api_keys').update({ revoked: true }).eq('id', keyId);
  if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
}
