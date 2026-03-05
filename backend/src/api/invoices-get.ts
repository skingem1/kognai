import { Request, Response } from 'express';
import { z } from 'zod';

const idSchema = z.string().min(1);

const mockGetInvoiceById = (id: string) => ({
  id,
  number: 'INV-001',
  amount: 0,
  currency: 'USD',
  status: 'pending',
  createdAt: new Date().toISOString(),
  paidAt: null,
  metadata: {}
});

export async function getInvoiceById(req: Request, res: Response): Promise<void> {
  const validation = idSchema.safeParse(req.params.id);

  if (!validation.success) {
    res.status(400).json({ error: 'Invalid invoice ID' });
    return;
  }

  const invoice = mockGetInvoiceById(validation.data);
  res.status(200).json(invoice);
}