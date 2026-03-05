import { Request, Response } from 'express';
import { listMerchants, createMerchant, getMerchant } from '../merchants';

describe('merchants API', () => {
  const mockRes = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() }) as unknown as Response;

  describe('listMerchants', () => {
    it('returns merchants with default pagination', async () => {
      const req = { query: {} } as unknown as Request;
      const res = mockRes();
      await listMerchants(req, res);
      const data = (res.json as jest.Mock).mock.calls[0][0];
      expect(data.total).toBe(2);
      expect(data.merchants).toHaveLength(2);
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });

    it('applies custom limit from query', async () => {
      const req = { query: { limit: '5' } } as unknown as Request;
      const res = mockRes();
      await listMerchants(req, res);
      expect((res.json as jest.Mock).mock.calls[0][0].limit).toBe(5);
    });
  });

  describe('createMerchant', () => {
    it('returns 201 with merchant data', async () => {
      const req = { body: { name: 'Test' } } as unknown as Request;
      const res = mockRes();
      await createMerchant(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      const data = (res.json as jest.Mock).mock.calls[0][0];
      expect(data.name).toBe('Test');
      expect(data.id).toMatch(/^merch_/);
      expect(data.status).toBe('active');
      expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
    });

    it('uses defaults when body is empty', async () => {
      const req = { body: {} } as unknown as Request;
      const res = mockRes();
      await createMerchant(req, res);
      const data = (res.json as jest.Mock).mock.calls[0][0];
      expect(data.name).toBe('New Merchant');
    });
  });

  describe('getMerchant', () => {
    it('returns merchant by id', async () => {
      const req = { params: { id: 'merch_001' } } as unknown as Request;
      const res = mockRes();
      await getMerchant(req, res);
      const data = (res.json as jest.Mock).mock.calls[0][0];
      expect(data.id).toBe('merch_001');
      expect(data.name).toBe('Acme Corp');
    });
  });
});