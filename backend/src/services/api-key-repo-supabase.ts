/**
 * Supabase-backed ApiKeyRepository
 * Drop this into services/api-keys.ts to replace InMemoryApiKeyRepository.
 */
import { createClient } from '@supabase/supabase-js';
import { ApiKey, ApiKeyRepository } from './api-keys';
import * as crypto from 'crypto';

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function rowToApiKey(row: any): ApiKey {
  return {
    id:            row.id,
    customerId:    row.customerId,
    customerEmail: row.customerEmail || `${row.customerId}@agents.invoica.ai`,
    keyHash:       row.keyHash,
    keyPrefix:     row.keyPrefix,
    name:          row.name,
    tier:          row.tier || 'free',
    plan:          row.plan || 'basic',
    permissions:   row.permissions || [],
    isActive:      row.isActive,
    expiresAt:     row.expiresAt ? new Date(row.expiresAt) : null,
    lastUsedAt:    row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    createdAt:     new Date(row.createdAt),
    updatedAt:     new Date(row.updatedAt),
  };
}

export class SupabaseApiKeyRepository implements ApiKeyRepository {
  async findById(id: string): Promise<ApiKey | null> {
    const { data } = await getSb().from('ApiKey').select('*').eq('id', id).single();
    return data ? rowToApiKey(data) : null;
  }

  async findByCustomerId(customerId: string): Promise<ApiKey[]> {
    const { data } = await getSb().from('ApiKey').select('*').eq('customerId', customerId);
    return (data || []).map(rowToApiKey);
  }

  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey | null> {
    const { data } = await getSb().from('ApiKey').select('*').eq('keyPrefix', keyPrefix).eq('isActive', true).limit(1).single();
    return data ? rowToApiKey(data) : null;
  }

  async create(input: Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiKey> {
    const { data, error } = await getSb()
      .from('ApiKey')
      .insert({
        customerId:    input.customerId,
        customerEmail: input.customerEmail,
        keyHash:       input.keyHash,
        keyPrefix:     input.keyPrefix,
        name:          input.name,
        tier:          input.tier,
        plan:          input.plan,
        permissions:   input.permissions,
        isActive:      input.isActive,
        expiresAt:     input.expiresAt?.toISOString() || null,
        lastUsedAt:    null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create API key: ${error.message}`);
    return rowToApiKey(data);
  }

  async update(id: string, data: Partial<ApiKey>): Promise<ApiKey> {
    const updateData: any = {};
    if (data.name        !== undefined) updateData.name        = data.name;
    if (data.isActive    !== undefined) updateData.isActive    = data.isActive;
    if (data.tier        !== undefined) updateData.tier        = data.tier;
    if (data.plan        !== undefined) updateData.plan        = data.plan;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;
    if (data.keyHash     !== undefined) updateData.keyHash     = data.keyHash;
    if (data.keyPrefix   !== undefined) updateData.keyPrefix   = data.keyPrefix;
    if (data.lastUsedAt  !== undefined) updateData.lastUsedAt  = data.lastUsedAt?.toISOString() || null;
    updateData.updatedAt = new Date().toISOString();

    const { data: row, error } = await getSb()
      .from('ApiKey')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update API key: ${error.message}`);
    return rowToApiKey(row);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await getSb().from('ApiKey').delete().eq('id', id);
    return !error;
  }

  async rotate(id: string): Promise<ApiKey> {
    // Rotation handled at service layer — just a passthrough here
    const existing = await this.findById(id);
    if (!existing) throw new Error('API key not found');
    return existing;
  }
}
