import { Request, Response } from 'express';

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  status: 'success' | 'pending' | 'failed';
  timestamp: string;
}

/**
 * Mock dashboard activity endpoint handler
 * Returns hardcoded recent activity items for frontend development
 */
export async function getDashboardActivity(req: Request, res: Response): Promise<void> {
  const activities: ActivityItem[] = [
    {
      id: '1',
      title: 'Invoice INV-0042 paid',
      description: 'Payment of $1,250.00 received for invoice INV-0042',
      status: 'success',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: '2',
      title: 'Settlement confirmed on Base',
      description: 'Settlement batch #SB-2024-0156 confirmed on Base network',
      status: 'success',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: '3',
      title: 'API key rotated',
      description: 'Production API key rotated successfully',
      status: 'success',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
      id: '4',
      title: 'Webhook delivery failed',
      description: 'Failed to deliver webhook to https://example.com/webhook',
      status: 'failed',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
  ];

  res.json(activities);
}