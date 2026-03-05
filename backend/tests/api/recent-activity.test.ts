import { Request, Response } from 'express';
import { getRecentActivity } from '../../src/api/recent-activity';
import { prisma } from '../../src/db/client';

jest.mock('../../src/db/client');

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getRecentActivity', () => {
  it('returns mapped activity items for SETTLED invoice', async () => {
    const mockInvoices = [{
      id: '1', invoiceNumber: '001', status: 'SETTLED', amount: 1000, currency: 'USD',
      customerName: 'Acme', createdAt: new Date('2024-01-01'), settledAt: new Date('2024-01-02')
    }];
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);
    const req = {} as Request;
    const res = mockRes();

    await getRecentActivity(req, res as Response);

    expect(res.json).toHaveBeenCalledWith([{
      id: '1', type: 'payment', title: 'Payment Received',
      description: 'Acme — USD 1000', timestamp: '2024-01-01T00:00:00.000Z', status: 'success'
    }]);
  });

  it('returns invoice type for PENDING status', async () => {
    const mockInvoices = [{
      id: '2', invoiceNumber: '002', status: 'PENDING', amount: 500, currency: 'EUR',
      customerName: 'Beta', createdAt: new Date('2024-01-03'), settledAt: null
    }];
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);
    const req = {} as Request;
    const res = mockRes();

    await getRecentActivity(req, res as Response);

    expect(res.json).toHaveBeenCalledWith([{
      id: '2', type: 'invoice', title: 'Invoice #INV-002',
      description: 'Beta — EUR 500', timestamp: '2024-01-03T00:00:00.000Z', status: 'pending'
    }]);
  });

  it('returns empty array when no invoices exist', async () => {
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
    const req = {} as Request;
    const res = mockRes();

    await getRecentActivity(req, res as Response);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns 500 on database error', async () => {
    (prisma.invoice.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    const req = {} as Request;
    const res = mockRes();

    await getRecentActivity(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch recent activity' });
  });
});