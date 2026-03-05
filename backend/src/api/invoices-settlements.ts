import { Request, Response } from 'express';

/**
 * Mock endpoint returning invoice-settlement pairs for dashboard
 */
export async function getInvoicesWithSettlements(
  req: Request,
  res: Response
): Promise<void> {
  const invoices = [
    {
      id: 'inv_001',
      number: 'INV-0001',
      amount: 1000,
      currency: 'USD',
      status: 'paid',
      settlement: {
        id: 'stl_001',
        status: 'confirmed',
        txHash: '0xabc123',
        chain: 'base',
      },
    },
    {
      id: 'inv_002',
      number: 'INV-0002',
      amount: 2500,
      currency: 'USD',
      status: 'pending',
      settlement: null,
    },
    {
      id: 'inv_003',
      number: 'INV-0003',
      amount: 750,
      currency: 'EUR',
      status: 'paid',
      settlement: {
        id: 'stl_003',
        status: 'confirmed',
        txHash: '0xdef456',
        chain: 'ethereum',
      },
    },
  ];

  res.json({ invoices });
}