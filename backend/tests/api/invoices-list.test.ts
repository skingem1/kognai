import { Request, Response } from 'express';
import { listInvoices } from '../../src/api/invoices-list';
import { prisma } from '../../src/db/client';

jest.mock('../../src/db/client');

const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('listInvoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invoices with correct format', async () => {
    const mockInvoices = [{
      id: '1',
      invoiceNumber: '001',
      amount: 100n,
      currency: 'USD',
      status: 'PENDING' as const,
      createdAt: new Date('2024-01-01')
    }];
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);
    (prisma.invoice.count as jest.Mock).mockResolvedValue(1);

    const req = { query: { limit: '10', offset: '0' } } as unknown as Request;
    const res = mockResponse();

    await listInvoices(req, res);

    expect(res.json).toHaveBeenCalledWith({
      invoices: [{
        id: '1',
        number: 'INV-001',
        amount: 100,
        currency: 'USD',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }],
      total: 1,
      limit: 10,
      offset: 0
    });
  });

  it('uses default limit and offset when not provided', async () => {
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

    const req = { query: {} } as unknown as Request;
    const res = mockResponse();

    await listInvoices(req, res);

    expect(prisma.invoice.findMany).toHaveBeenCalledWith({
      take: 10,
      skip: 0,
      orderBy: { createdAt: 'desc' }
    });
  });

  it('returns 500 on database error', async () => {
    (prisma.invoice.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const req = { query: {} } as unknown as Request;
    const res = mockResponse();

    await listInvoices(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch invoices' });
  });
});