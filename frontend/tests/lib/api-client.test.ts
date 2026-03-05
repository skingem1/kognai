// frontend/tests/lib/api-client.test.ts

import { apiGet, apiPost, apiDelete, fetchApiKeys, createNewApiKey, revokeApiKey, rotateApiKey } from '@/lib/api-client';

global.fetch = jest.fn();

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('apiGet', () => {
    it('should fetch and return data on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });
      const result = await apiGet('/test');
      expect(result).toEqual({ data: 'test' });
    });

    it('should throw ApiError on failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not found' }),
      });
      await expect(apiGet('/test')).rejects.toThrow();
    });
  });

  describe('apiPost', () => {
    it('should POST data and return response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', name: 'Key' }),
      });
      const result = await apiPost('/v1/api-keys', { name: 'Test' });
      expect(result).toEqual({ id: '1', name: 'Key' });
    });
  });

  describe('apiDelete', () => {
    it('should DELETE endpoint without returning data', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await expect(apiDelete('/v1/api-keys/1')).resolves.toBeUndefined();
    });
  });

  describe('fetchApiKeys', () => {
    it('should return array of ApiKeys', async () => {
      const mockKeys = [{ id: '1', name: 'Key', keyPrefix: 'sk_', tier: 'pro', plan: 'basic', permissions: ['read'], isActive: true, createdAt: '2024-01-01', lastUsedAt: null }];
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => mockKeys });
      const result = await fetchApiKeys('cust_123');
      expect(result).toEqual(mockKeys);
    });
  });

  describe('createNewApiKey', () => {
    it('should create and return new API key with full key', async () => {
      const mockResponse = { id: '1', name: 'New Key', keyPrefix: 'sk_', tier: 'pro', plan: 'basic', permissions: ['read'], isActive: true, createdAt: '2024-01-01', lastUsedAt: null, key: 'sk_live_xxx' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => mockResponse });
      const result = await createNewApiKey({ customerId: 'cust_1', customerEmail: 'test@test.com', name: 'New Key' });
      expect(result.key).toBe('sk_live_xxx');
    });
  });

  describe('revokeApiKey', () => {
    it('should call apiDelete with correct endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await revokeApiKey('key_123');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/api-keys/key_123'), expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate and return new API key', async () => {
      const rotated = { id: '1', name: 'Rotated', keyPrefix: 'sk_', tier: 'pro', plan: 'basic', permissions: ['read'], isActive: true, createdAt: '2024-01-02', lastUsedAt: null, key: 'sk_live_new' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => rotated });
      const result = await rotateApiKey('key_123');
      expect(result.key).toBe('sk_live_new');
    });
  });
});