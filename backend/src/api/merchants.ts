import { Request, Response } from 'express';

export async function listMerchants(req: Request, res: Response): Promise<void> {
  res.json({
    merchants: [
      { id: 'merch_001', name: 'Acme Corp', email: 'billing@acme.com', status: 'active', createdAt: '2026-01-15T10:00:00Z' },
      { id: 'merch_002', name: 'Globex Inc', email: 'pay@globex.io', status: 'active', createdAt: '2026-02-01T08:30:00Z' },
    ],
    total: 2,
    limit: Number(req.query.limit) || 10,
    offset: Number(req.query.offset) || 0,
  });
}

export async function createMerchant(req: Request, res: Response): Promise<void> {
  res.status(201).json({
    id: 'merch_' + Date.now().toString(36),
    name: req.body.name || 'New Merchant',
    email: req.body.email || '',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
}

export async function getMerchant(req: Request, res: Response): Promise<void> {
  res.json({
    id: req.params.id,
    name: 'Acme Corp',
    email: 'billing@acme.com',
    status: 'active',
    createdAt: '2026-01-15T10:00:00Z',
  });
}
