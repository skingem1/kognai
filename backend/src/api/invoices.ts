import { Request, Response } from 'express';
import { listInvoices } from './invoices-list';
import { createInvoice } from './invoices-create';
import { getInvoiceById } from './invoices-get';

export { listInvoices, createInvoice };
export { getInvoiceById as getInvoice };

export async function updateInvoice(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const updates = req.body;
  res.json({ id, ...updates, updatedAt: new Date().toISOString() });
}
