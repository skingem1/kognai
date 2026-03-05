import { Request, Response } from 'express';

/**
 * Mock dashboard statistics endpoint handler.
 * Returns hardcoded statistics for frontend development.
 */
export async function getDashboardStats(_req: Request, res: Response): Promise<void> {
  res.json({
    totalInvoices: 156,
    pending: 23,
    settled: 128,
    revenue: 45250.00,
    failedSettlements: 5,
  });
}