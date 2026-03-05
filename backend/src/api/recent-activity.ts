import { Router, Request, Response } from 'express';

const router = Router();

const activities = [
  { id: 'act_1', title: 'Invoice #INV-0042 Created', description: 'Amount: $1,000 USD', status: 'success', timestamp: '2 minutes ago' },
  { id: 'act_2', title: 'Settlement Processing', description: 'Invoice #INV-0041 — waiting for on-chain confirmation', status: 'pending', timestamp: '15 minutes ago' },
  { id: 'act_3', title: 'API Key Generated', description: 'Key inv_a1b2...c5d6 created for Production', status: 'success', timestamp: '1 hour ago' },
  { id: 'act_4', title: 'Webhook Delivery Failed', description: 'Endpoint https://app.example.com/webhook returned 500', status: 'failed', timestamp: '3 hours ago' },
  { id: 'act_5', title: 'Invoice #INV-0040 Settled', description: 'Amount: $2,500 USD — confirmed on Base', status: 'success', timestamp: '5 hours ago' }
];

router.get('/', (_req: Request, res: Response) => {
  res.json(activities);
});

export default router;