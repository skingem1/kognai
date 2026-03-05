import { Request, Response } from 'express';
import { getInvoicesWithSettlements } from '../invoices-settlements';

describe('getInvoicesWithSettlements', () => {
  it('returns array of 3 invoices with correct structure', async () => {
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const mockReq = {} as Request;

    await getInvoicesWithSettlements(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledTimes(1);
    const { invoices } = (mockRes.json as jest.Mock).mock.calls[0][0];
    expect(invoices).toHaveLength(3);
  });

  it('first invoice has correct id, status and settlement chain', async () => {
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const mockReq = {} as Request;

    await getInvoicesWithSettlements(mockReq, mockRes);
    const { invoices } = (mockRes.json as jest.Mock).mock.calls[0][0];

    expect(invoices[0].id).toBe('inv_001');
    expect(invoices[0].status).toBe('paid');
    expect(invoices[0].settlement).not.toBeNull();
    expect(invoices[0].settlement?.chain).toBe('base');
  });

  it('second invoice has pending status and null settlement', async () => {
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const mockReq = {} as Request;

    await getInvoicesWithSettlements(mockReq, mockRes);
    const { invoices } = (mockRes.json as jest.Mock).mock.calls[0][0];

    expect(invoices[1].id).toBe('inv_002');
    expect(invoices[1].status).toBe('pending');
    expect(invoices[1].settlement).toBeNull();
  });

  it('third invoice has EUR currency and ethereum settlement chain', async () => {
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const mockReq = {} as Request;

    await getInvoicesWithSettlements(mockReq, mockRes);
    const { invoices } = (mockRes.json as jest.Mock).mock.calls[0][0];

    expect(invoices[2].currency).toBe('EUR');
    expect(invoices[2].settlement?.chain).toBe('ethereum');
  });

  it('all invoices have required fields and paid invoices have settlement objects', async () => {
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    const mockReq = {} as Request;

    await getInvoicesWithSettlements(mockReq, mockRes);
    const { invoices } = (mockRes.json as jest.Mock).mock.calls[0][0];

    invoices.forEach((inv: any) => {
      expect(inv).toHaveProperty('id');
      expect(inv).toHaveProperty('number');
      expect(inv).toHaveProperty('amount');
      expect(inv).toHaveProperty('currency');
      expect(inv).toHaveProperty('status');
    });

    const paidInvoices = invoices.filter((inv: any) => inv.status === 'paid');
    paidInvoices.forEach((inv: any) => {
      expect(inv.settlement).not.toBeNull();
      expect(inv.settlement).toHaveProperty('id');
      expect(inv.settlement).toHaveProperty('status');
      expect(inv.settlement).toHaveProperty('txHash');
      expect(inv.settlement).toHaveProperty('chain');
    });
  });
});