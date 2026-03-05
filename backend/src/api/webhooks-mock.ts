import { Request, Response } from 'express';

/**
 * Mock webhooks endpoint handler for the dashboard.
 * This is a MOCK implementation - no database operations or validation.
 */

/**
 * Lists all registered webhooks.
 * @param req - Express request object
 * @param res - Express response object
 */
export async function listWebhooks(req: Request, res: Response): Promise<void> {
  const mockWebhooks = [
    {
      id: 'wh_001',
      url: 'https://example.com/webhook',
      events: ['invoice.paid', 'settlement.confirmed'],
      status: 'active',
      createdAt: '2026-02-05T00:00:00Z',
    },
  ];

  res.json({
    webhooks: mockWebhooks,
    total: mockWebhooks.length,
  });
}

/**
 * Registers a new webhook endpoint.
 * @param req - Express request object
 * @param res - Express response object
 */
export async function registerWebhook(req: Request, res: Response): Promise<void> {
  const mockWebhook = {
    id: 'wh_002',
    url: req.body.url || 'https://example.com/new',
    events: req.body.events || ['invoice.created'],
    status: 'active',
    secret: 'whsec_abc123',
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(mockWebhook);
}