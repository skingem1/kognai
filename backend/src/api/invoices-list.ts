import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { InvoiceStatus } from '@prisma/client';

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;

  try {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.invoice.count()
    ]);

    res.json({
      invoices: invoices.map(inv => ({
        id: inv.id,
        number: 'INV-' + inv.invoiceNumber,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status.toLowerCase() as Lowercase<keyof typeof InvoiceStatus>,
        createdAt: inv.createdAt.toISOString()
      })),
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('listInvoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
}