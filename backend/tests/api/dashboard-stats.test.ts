import { Request, Response } from 'express';
import { getDashboardStats } from '../../src/api/dashboard-stats';
import { prisma } from '../../src/db/client';

jest.mock('../../src/db/client');

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getDashboardStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns stats for happy path', async () => {
    (prisma.invoice.count as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7);
    (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 5000 } });

    const req = {} as Request;
    const res = mockRes() as Response;

    await getDashboardStats(req, res);

    expect(res.json).toHaveBeenCalledWith({ totalInvoices: 10, pending: 3, settled: 7, revenue: 5000 });
  });

  it('returns 500 on database error', async () => {
    (prisma.invoice.count as jest.Mock).mockRejectedValue(new Error('DB fail'));

    const req = {} as Request;
    const res = mockRes() as Response;

    await getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('returns zero revenue when no settled invoices', async () => {
    (prisma.invoice.count as jest.Mock)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: null } });

    const req = {} as Request;
    const res = mockRes() as Response;

    await getDashboardStats(req, res);

    expect(res.json).toHaveBeenCalledWith({ totalInvoices: 2, pending: 2, settled: 0, revenue: 0 });
  });
});