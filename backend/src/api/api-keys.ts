import { Request, Response } from 'express';
import {
  createApiKey,
  getCustomerApiKeys,
  invalidateApiKey,
  rotateApiKey,
  createApiKeySchema,
} from '../services/api-keys';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * POST /api-keys - Create a new API key for a customer
 */
export async function createApiKeyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const parseResult = createApiKeySchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const result = await createApiKey(parseResult.data);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating API key', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api-keys - List all API keys for a customer
 */
export async function listApiKeysHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const customerId = req.query.customerId;

    if (!customerId || typeof customerId !== 'string') {
      res.status(400).json({ error: 'customerId query parameter is required' });
      return;
    }

    const apiKeys = await getCustomerApiKeys(customerId);
    res.status(200).json(apiKeys);
  } catch (error) {
    logger.error('Error listing API keys', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api-keys/:id - Revoke (invalidate) an API key
 */
export async function revokeApiKeyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'API key ID is required' });
      return;
    }

    await invalidateApiKey(id);
    res.status(200).json({ message: 'API key invalidated successfully' });
  } catch (error) {
    logger.error('Error revoking API key', { error, keyId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api-keys/:id/rotate - Rotate an API key (invalidate old, create new)
 */
export async function rotateApiKeyHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'API key ID is required' });
      return;
    }

    const newApiKey = await rotateApiKey(id);
    res.status(200).json(newApiKey);
  } catch (error) {
    logger.error('Error rotating API key', { error, keyId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
}