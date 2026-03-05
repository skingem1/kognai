import { z } from 'zod';

export const createInvoiceSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  description: z.string().max(500).optional(),
  customerId: z.string().uuid().optional(),
  metadata: z.record(z.string()).optional(),
});

export const updateInvoiceSchema = z
  .object({
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    description: z.string().max(500).optional(),
    metadata: z.record(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const invoiceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;