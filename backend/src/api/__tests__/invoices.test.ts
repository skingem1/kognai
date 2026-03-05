import { updateInvoice, listInvoices, createInvoice, getInvoice } from '../invoices';

describe('invoices', () => {
  describe('updateInvoice', () => {
    it('updates invoice with provided fields and adds updatedAt', async () => {
      const req = { params: { id: 'inv_001' }, body: { amount: 500, status: 'paid' } };
      const res = { json: jest.fn() };
      await updateInvoice(req as any, res as any);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv_001', amount: 500, status: 'paid' }));
      const [call] = res.json.mock.calls;
      expect(new Date(call[0].updatedAt).toISOString()).toBe(call[0].updatedAt);
    });

    it('returns id and updatedAt when body is empty', async () => {
      const req = { params: { id: 'inv_002' }, body: {} };
      const res = { json: jest.fn() };
      await updateInvoice(req as any, res as any);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv_002', updatedAt: expect.any(String) }));
    });

    it('updatedAt is always a valid ISO timestamp', async () => {
      const req = { params: { id: 'inv_003' }, body: { amount: 100 } };
      const res = { json: jest.fn() };
      await updateInvoice(req as any, res as any);
      const [call] = res.json.mock.calls;
      expect(() => new Date(call[0].updatedAt)).not.toThrow();
      expect(call[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('re-exports', () => {
    it('exports listInvoices as function', () => expect(typeof listInvoices).toBe('function'));
    it('exports createInvoice as function', () => expect(typeof createInvoice).toBe('function'));
    it('exports getInvoice as function', () => expect(typeof getInvoice).toBe('function'));
  });
});