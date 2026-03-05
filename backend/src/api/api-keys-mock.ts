import { Request, Response } from 'express';

/**
 * Mock API keys data for development/testing
 */
const mockApiKeys = [
  {
    id: 'key_001',
    name: 'Production Key',
    prefix: 'sk_prod_',
    createdAt: '2026-02-01T00:00:00Z',
    expiresAt: '2027-02-01T00:00:00Z',
    lastUsedAt: '2026-02-15T10:30:00Z',
  },
  {
    id: 'key_002',
    name: 'Test Key',
    prefix: 'sk_test_',
    createdAt: '2026-02-10T00:00:00Z',
  },
];

/**
 * Lists all API keys for the authenticated user's organization.
 * Returns mock API keys data for dashboard display.
 * 
 * @param req - Express Request object
 * @param res - Express Response object
 * @returns Promise<void>
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  res.json({ apiKeys: mockApiKeys });
}

/**
 * Creates a new API key for the authenticated user's organization.
 * Returns mock API key data with a generated secret.
 * 
 * @param req - Express Request object (expects req.body.name for key name)
 * @param res - Express Response object
 * @returns Promise<void>
 */
export async function createApiKey(req: Request, res: Response): Promise<void> {
  const newApiKey = {
    id: 'key_003',
    name: req.body?.name || 'New Key',
    prefix: 'sk_new_',
    createdAt: new Date().toISOString(),
  };

  res.status(201).json({
    apiKey: newApiKey,
    secret: 'sk_live_abc123def456',
  });
}