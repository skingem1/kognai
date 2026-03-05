import { Router, Request, Response, NextFunction } from 'express';
import { createRateLimiter } from '../middleware/rate-limiter';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../errors/app-error';

/**
 * Rate limiter for invoice routes: 100 requests per minute per API key
 */
const invoiceLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 100,
  keyPrefix: 'invoice',
});

const router = Router();

// Apply rate limiting to all invoice routes
router.use(invoiceLimiter);

/**
 * Validation schemas
 */
const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(['pending', 'settled', 'processing', 'completed']).optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
});

/**
 * GET /api/invoices
 * List all invoices with pagination
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true },
      }),
      prisma.invoice.count(),
    ]);

    res.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/invoices/:id
 * Get a single invoice by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, payments: true },
    });

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/invoices
 * Create a new invoice
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = createInvoiceSchema.parse(req.body);

    // Generate sequential invoice number atomically
    const invoiceNumber = await prisma.$transaction(async (tx) => {
      const lastInvoice = await tx.invoice.findFirst({
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
      });

      const nextNumber = lastInvoice ? parseInt(lastInvoice.invoiceNumber.slice(3)) + 1 : 1;
      return `INV-${nextNumber.toString().padStart(6, '0')}`;
    });

    const invoice = await prisma.invoice.create({
      data: {
        ...validatedData,
        invoiceNumber,
        status: 'pending',
      },
      include: { customer: true },
    });

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Validation failed', 400, error.errors));
      return;
    }
    next(error);
  }
});

/**
 * PATCH /api/invoices/:id
 * Update an invoice
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = updateInvoiceSchema.parse(req.body);

    const invoice = await prisma.invoice.update({
      where: { id },
      data: validatedData,
      include: { customer: true },
    });

    res.json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Validation failed', 400, error.errors));
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/invoices/:id
 * Delete an invoice
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await prisma.invoice.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
