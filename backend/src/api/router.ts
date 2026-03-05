import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSettlements, getSettlement } from './settlements';
import { listInvoices, createInvoice, getInvoice, updateInvoice } from './invoices';
import { listMerchants, createMerchant, getMerchant } from './merchants';
import { createPayment, getPayment } from './payments';
import { getDashboardStats } from './dashboard-stats';
import { getDashboardActivity } from './dashboard-activity';
import { getInvoicesWithSettlements } from './invoices-settlements';
import { listApiKeys, createApiKey } from './api-keys-mock';
import { listWebhooks, registerWebhook } from './webhooks-mock';
import { AppError, ValidationError } from '../errors';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Validates request against a Zod schema
 */
function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid request data', result.error.errors);
  }
  return result.data;
}

/**
 * Async route handler wrapper to catch errors
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Settlement routes
router.get('/v1/settlements/:invoiceId', asyncHandler(getSettlement));
router.get('/v1/settlements', asyncHandler(getSettlements));

// Invoice routes
router.get('/v1/invoices', asyncHandler(listInvoices));
router.post('/v1/invoices', asyncHandler(createInvoice));
router.get('/v1/invoices/:id', asyncHandler(getInvoice));
router.patch('/v1/invoices/:id', asyncHandler(updateInvoice));

// Merchant routes
router.get('/v1/merchants', asyncHandler(listMerchants));
router.post('/v1/merchants', asyncHandler(createMerchant));
router.get('/v1/merchants/:id', asyncHandler(getMerchant));

// Payment routes
router.post('/v1/payments', asyncHandler(createPayment));
router.get('/v1/payments/:id', asyncHandler(getPayment));

// Dashboard routes (Week 17)
router.get('/v1/dashboard/stats', asyncHandler(getDashboardStats));
router.get('/v1/dashboard/activity', asyncHandler(getDashboardActivity));
router.get('/v1/invoices-settlements', asyncHandler(getInvoicesWithSettlements));

// API Keys mock endpoints (Week 18)
router.get('/v1/api-keys', asyncHandler(listApiKeys));
router.post('/v1/api-keys', asyncHandler(createApiKey));

// Webhooks mock endpoints (Week 18)
router.get('/v1/webhooks', asyncHandler(listWebhooks));
router.post('/v1/webhooks', asyncHandler(registerWebhook));

// 404 handler
router.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Router error', { error: err.message, stack: err.stack });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
  });
});

export { router };
