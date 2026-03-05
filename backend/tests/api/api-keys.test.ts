import { Request, Response } from 'express';
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
  rotateApiKeyHandler,
} from '../../../src/api/api-keys';
import * as apiKeysService from '../../../src/services/api-keys';

jest.mock('../../../src/services/api-keys');
jest.mock('../../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('API Keys Handlers', () => {
  beforeEach(jest.clearAllMocks);

  describe('createApiKeyHandler', () => {
    it('returns 201 with created key on valid input', async () => {
      const mockKey = { id: '1', key: 'sk_test_xxx', customerId: 'c1' };
      (apiKeysService.createApiKey as jest.Mock).mockResolvedValue(mockKey);
      const req = { body: { customerId: 'c1', name: 'Test Key' } } as unknown as Request;
      const res = mockRes();

      await createApiKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockKey);
    });

    it('returns 400 on invalid input', async () => {
      const req = { body: {} } as unknown as Request;
      const res = mockRes();

      await createApiKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('listApiKeysHandler', () => {
    it('returns 200 with keys for customer', async () => {
      const keys = [{ id: '1', key: 'sk_test_xxx' }];
      (apiKeysService.getCustomerApiKeys as jest.Mock).mockResolvedValue(keys);
      const req = { query: { customerId: 'c1' } } as unknown as Request;
      const res = mockRes();

      await listApiKeysHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(keys);
    });

    it('returns 400 if customerId missing', async () => {
      const req = { query: {} } as unknown as Request;
      const res = mockRes();

      await listApiKeysHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('revokeApiKeyHandler', () => {
    it('returns 200 on success', async () => {
      (apiKeysService.invalidateApiKey as jest.Mock).mockResolvedValue(undefined);
      const req = { params: { id: '1' } } as unknown as Request;
      const res = mockRes();

      await revokeApiKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('rotateApiKeyHandler', () => {
    it('returns 200 with new key', async () => {
      const newKey = { id: '1', key: 'sk_test_new' };
      (apiKeysService.rotateApiKey as jest.Mock).mockResolvedValue(newKey);
      const req = { params: { id: '1' } } as unknown as Request;
      const res = mockRes();

      await rotateApiKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(newKey);
    });
  });
});