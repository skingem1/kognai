import { generateApiKey, validateApiKey, revokeApiKey, ApiKey } from '../../services/api-key-service';
import { createClient, SupabaseClient } from '@supabase/supabase-jest';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  from: jest.fn().mockReturnValue({
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
} as unknown as SupabaseClient;

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('ApiKeyService', () => {
  const mockApiKeyRecord: ApiKey = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    user_id: '223e4567-e89b-12d3-a456-426614174001',
    key_hash: 'a'.repeat(64),
    name: 'Test Key',
    created_at: new Date().toISOString(),
    revoked: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateApiKey', () => {
    it('should generate a key with inv_ prefix', async () => {
      (mockSupabase.from('api_keys') as any).insert().select().single.mockResolvedValueOnce({
        data: mockApiKeyRecord,
        error: null,
      });

      const result = await generateApiKey('223e4567-e89b-12d3-a456-426614174001', 'Test Key');

      expect(result.key).toMatch(/^inv_/);
    });

    it('should store key hash in database', async () => {
      (mockSupabase.from('api_keys') as any).insert().select().single.mockResolvedValueOnce({
        data: mockApiKeyRecord,
        error: null,
      });

      await generateApiKey('223e4567-e89b-12d3-a456-426614174001', 'Test Key');

      expect(mockSupabase.from).toHaveBeenCalledWith('api_keys');
    });

    it('should return plaintext key only once', async () => {
      (mockSupabase.from('api_keys') as any).insert().select().single.mockResolvedValueOnce({
        data: mockApiKeyRecord,
        error: null,
      });

      const { key } = await generateApiKey('223e4567-e89b-12d3-a456-426614174001', 'Test Key');

      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(4);
    });

    it('should handle expiration date when provided', async () => {
      (mockSupabase.from('api_keys') as any).insert().select().single.mockResolvedValueOnce({
        data: { ...mockApiKeyRecord, expires_at: new Date(Date.now() + 86400000).toISOString() },
        error: null,
      });

      const result = await generateApiKey('223e4567-e89b-12d3-a456-426614174001', 'Test Key', 1);

      expect(result.api_key_record.expires_at).toBeDefined();
    });

    it('should throw error on database failure', async () => {
      (mockSupabase.from('api_keys') as any).insert().select().single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(generateApiKey('223e4567-e89b-12d3-a456-426614174001', 'Test Key')).rejects.toThrow(
        'Failed to generate API key'
      );
    });
  });

  describe('validateApiKey', () => {
    it('should return null for non-existent key', async () => {
      (mockSupabase.from('api_keys') as any).select().eq().single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await validateApiKey('invalid_key');

      expect(result).toBeNull();
    });

    it('should return null for revoked key', async () => {
      (mockSupabase.from('api_keys') as any).select().eq().single.mockResolvedValueOnce({
        data: { ...mockApiKeyRecord, revoked: true },
        error: null,
      });

      const result = await validateApiKey('inv_abc123');

      expect(result).toBeNull();
    });

    it('should return null for expired key', async () => {
      (mockSupabase.from('api_keys') as any).select().eq().single.mockResolvedValueOnce({
        data: { ...mockApiKeyRecord, expires_at: '2020-01-01T00:00:00Z' },
        error: null,
      });

      const result = await validateApiKey('inv_abc123');

      expect(result).toBeNull();
    });

    it('should return record for valid non-expired key', async () => {
      (mockSupabase.from('api_keys') as any).select().eq().single.mockResolvedValueOnce({
        data: mockApiKeyRecord,
        error: null,
      });
      (mockSupabase.from('api_keys') as any).update().eq.mockResolvedValueOnce({ error: null });

      const result = await validateApiKey('inv_abc123');

      expect(result).toEqual(mockApiKeyRecord);
    });

    it('should update last_used_at on successful validation', async () => {
      (mockSupabase.from('api_keys') as any).select().eq().single.mockResolvedValueOnce({
        data: mockApiKeyRecord,
        error: null,
      });

      await validateApiKey('inv_abc123');

      expect((mockSupabase.from('api_keys') as any).update).toHaveBeenCalled();
    });
  });

  describe('revokeApiKey', () => {
    it('should call update with revoked=true', async () => {
      (mockSupabase.from('api_keys') as any).update().eq.mockResolvedValueOnce({ error: null });

      await revokeApiKey('123e4567-e89b-12d3-a456-426614174000');

      expect((mockSupabase.from('api_keys') as any).update).toHaveBeenCalledWith({ revoked: true });
    });

    it('should throw error on database failure', async () => {
      (mockSupabase.from('api_keys') as any).update().eq.mockResolvedValueOnce({
        error: { message: 'Update failed' },
      });

      await expect(revokeApiKey('123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(
        'Failed to revoke API key'
      );
    });
  });
});
