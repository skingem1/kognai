import { Request, Response } from 'express';

export async function createPayment(req: Request, res: Response): Promise<void> {
  res.status(201).json({
    id: 'pay_' + Date.now().toString(36),
    invoiceId: req.body.invoiceId || '',
    amount: req.body.amount || 0,
    currency: req.body.currency || 'USD',
    method: req.body.method || 'crypto',
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  res.json({
    id: req.params.id,
    invoiceId: 'inv_sample',
    amount: 1000,
    currency: 'USD',
    method: 'crypto',
    status: 'confirmed',
    createdAt: '2026-02-10T12:00:00Z',
    confirmedAt: '2026-02-10T12:05:00Z',
  });
}