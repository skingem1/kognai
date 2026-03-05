import { Request, Response } from 'express';
import { createPayment, getPayment } from '../payments';

describe('payments API', () => {
  const mockRes = (): Response => ({ json: jest.fn(), status: jest.fn().mockReturnThis() }) as unknown as Response;

  describe('createPayment', () => {
    it('returns 201 with provided values', async () => {
      const req = { body: { invoiceId: 'inv_001', amount: 500, currency: 'EUR', method: 'wire' } } as Request;
      const res = mockRes();
      await createPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invoiceId: 'inv_001', amount: 500, currency: 'EUR', method: 'wire', status: 'pending'
      }));
    });

    it('uses defaults when body is empty', async () => {
      const req = { body: {} } as Request;
      const res = mockRes();
      await createPayment(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invoiceId: '', amount: 0, currency: 'USD', method: 'crypto'
      }));
    });

    it('id starts with pay_ and status is pending with valid ISO date', async () => {
      const req = { body: {} } as Request;
      const res = mockRes();
      await createPayment(req, res);
      const call = (res.json as jest.Mock).mock.calls[0][0];
      expect(call.id).toMatch(/^pay_/);
      expect(call.status).toBe('pending');
      expect(new Date(call.createdAt).toISOString()).toBe(call.createdAt);
    });
  });

  describe('getPayment', () => {
    it('returns payment by id with confirmed status', async () => {
      const req = { params: { id: 'pay_001' } } as unknown as Request;
      const res = mockRes();
      await getPayment(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pay_001', amount: 1000, currency: 'USD', method: 'crypto', status: 'confirmed', confirmedAt: '2026-02-10T12:05:00Z'
      }));
    });
  });
});