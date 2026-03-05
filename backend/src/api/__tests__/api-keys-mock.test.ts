import { Request, Response } from 'express';
import { listApiKeys, createApiKey } from '../api-keys-mock';

describe('api-keys-mock', () => {
  describe('listApiKeys', () => {
    it('returns array of 2 api keys with correct properties', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockReq = {} as Request;

      await listApiKeys(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledTimes(1);
      const { apiKeys } = mockRes.json.mock.calls[0][0];
      expect(apiKeys).toHaveLength(2);
      expect(apiKeys[0].id).toBe('key_001');
      expect(apiKeys[0].name).toBe('Production Key');
      expect(apiKeys[1].id).toBe('key_002');
      expect(apiKeys[1].name).toBe('Test Key');
      expect(new Date(apiKeys[0].createdAt).toISOString()).toBe(apiKeys[0].createdAt);
      expect(new Date(apiKeys[1].createdAt).toISOString()).toBe(apiKeys[1].createdAt);
    });
  });

  describe('createApiKey', () => {
    it('creates api key with provided name', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockReq = { body: { name: 'My Key' } } as unknown as Request;

      await createApiKey(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const { apiKey, secret } = mockRes.json.mock.calls[0][0];
      expect(apiKey.name).toBe('My Key');
      expect(apiKey.id).toBe('key_003');
      expect(apiKey.prefix).toBe('sk_new_');
      expect(new Date(apiKey.createdAt).toISOString()).toBe(apiKey.createdAt);
      expect(secret).toBe('sk_live_abc123def456');
    });

    it('defaults name when req.body is undefined', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockReq = {} as Request;

      await createApiKey(mockReq, mockRes);

      const { apiKey } = mockRes.json.mock.calls[0][0];
      expect(apiKey.name).toBe('New Key');
    });
  });
});