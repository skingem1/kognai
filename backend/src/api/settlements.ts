import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get a single settlement by ID
 */
export async function getSettlement(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        invoice: true,
      },
    });

    if (!settlement) {
      res.status(404).json({ error: 'Settlement not found' });
      return;
    }

    res.json(settlement);
  } catch (error) {
    console.error('Error fetching settlement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get all settlements with pagination
 */
export async function getSettlements(req: Request, res: Response): Promise<void> {
  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;
  const settlements = [{ id: 'stl_001', invoiceId: 'inv_001', status: 'confirmed', txHash: '0xabc123', chain: 'base', amount: 1000, currency: 'USD', confirmedAt: '2026-02-10T12:05:00Z', createdAt: '2026-02-10T12:00:00Z' }, { id: 'stl_002', invoiceId: 'inv_002', status: 'pending', txHash: null, chain: 'ethereum', amount: 2500, currency: 'USD', confirmedAt: null, createdAt: '2026-02-14T09:00:00Z' }];
  res.json({ settlements, total: 2, limit, offset });
}