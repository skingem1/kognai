import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

const SELECT_FIELDS = 'id, invoiceNumber, status, amount, currency, customerEmail, customerName, companyId, paymentDetails, settledAt, completedAt, createdAt, updatedAt';

function mapInvoice(inv: any) {
  const pd = inv.paymentDetails
    ? (typeof inv.paymentDetails === 'string' ? JSON.parse(inv.paymentDetails) : inv.paymentDetails)
    : {};
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    currency: inv.currency,
    customerEmail: inv.customerEmail,
    customerName: inv.customerName,
    companyId: inv.companyId || null,
    paymentDetails: {
      txHash: pd.txHash || null,
      network: pd.network || null,
      paidBy: pd.paidBy || null,
      ...pd,
    },
    settledAt: inv.settledAt,
    completedAt: inv.completedAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

/**
 * GET /v1/invoices/number/:number
 * Lookup invoice by sequential invoice number (e.g. 15).
 * IMPORTANT: This route MUST be registered before /v1/invoices/:id
 * to prevent Express matching "number" as an :id value.
 */
router.get('/v1/invoices/number/:number', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceNumber = parseInt(req.params.number, 10);
    if (isNaN(invoiceNumber) || invoiceNumber <= 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid invoice number — must be a positive integer', code: 'INVALID_NUMBER' },
      });
      return;
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('Invoice')
      .select(SELECT_FIELDS)
      .eq('invoiceNumber', invoiceNumber)
      .single();

    if (error || !data) {
      res.status(404).json({
        success: false,
        error: { message: `Invoice #${invoiceNumber} not found`, code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({ success: true, data: mapInvoice(data) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/invoices/:id
 * Lookup invoice by UUID.
 * Registered AFTER /v1/invoices/number/:number to avoid shadowing.
 */
router.get('/v1/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const sb = getSupabase();
    const { data, error } = await sb
      .from('Invoice')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({
        success: false,
        error: { message: 'Invoice not found', code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({ success: true, data: mapInvoice(data) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/invoices
 * List invoices with pagination and optional filters.
 * Query params: status, customerEmail, limit (max 100), offset
 */
router.get('/v1/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10) || 20, 100);
    const offset = parseInt(req.query.offset as string || '0', 10) || 0;
    const status = req.query.status as string | undefined;
    const customerEmail = req.query.customerEmail as string | undefined;

    const sb = getSupabase();
    let query = sb
      .from('Invoice')
      .select(SELECT_FIELDS, { count: 'exact' })
      .order('createdAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status.toUpperCase());
    if (customerEmail) query = query.eq('customerEmail', customerEmail);

    const { data, error, count } = await query;
    if (error) throw error;

    const total = count || 0;
    res.json({
      success: true,
      data: (data || []).map(mapInvoice),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/invoices
 * Create a new invoice.
 * Body: { customerEmail, customerName, amount, currency?, companyId?, paymentDetails? }
 */
router.post('/v1/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerEmail, customerName, amount, currency = 'USD', companyId, paymentDetails } = req.body;

    if (!customerEmail || typeof customerEmail !== 'string') {
      res.status(400).json({ success: false, error: { message: 'customerEmail is required', code: 'MISSING_FIELD' } });
      return;
    }
    if (!customerName || typeof customerName !== 'string') {
      res.status(400).json({ success: false, error: { message: 'customerName is required', code: 'MISSING_FIELD' } });
      return;
    }
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ success: false, error: { message: 'amount must be a positive number', code: 'INVALID_AMOUNT' } });
      return;
    }

    const sb = getSupabase();

    // Determine next invoice number via MAX query (atomic-safe for low throughput)
    const { data: maxData } = await sb
      .from('Invoice')
      .select('invoiceNumber')
      .order('invoiceNumber', { ascending: false })
      .limit(1)
      .single();

    const nextNumber = ((maxData?.invoiceNumber as number) || 0) + 1;
    const now = new Date().toISOString();

    const record = {
      invoiceNumber: nextNumber,
      status: 'PENDING',
      amount: Number(amount),
      currency: currency.toUpperCase(),
      customerEmail,
      customerName,
      companyId: companyId || null,
      paymentDetails: paymentDetails || null,
      createdAt: now,
      updatedAt: now,
    };

    const { data, error } = await sb.from('Invoice').insert(record).select(SELECT_FIELDS).single();
    if (error) throw error;

    res.status(201).json({ success: true, data: mapInvoice(data) });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /v1/invoices/:id/status
 * Update invoice status with transition validation.
 * Body: { status: 'PENDING' | 'SETTLED' | 'PROCESSING' | 'COMPLETED' }
 */
router.patch('/v1/invoices/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const VALID_STATUSES = ['PENDING', 'SETTLED', 'PROCESSING', 'COMPLETED'];
    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({
        success: false,
        error: { message: `status must be one of: ${VALID_STATUSES.join(', ')}`, code: 'INVALID_STATUS' },
      });
      return;
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      PENDING: ['PROCESSING', 'SETTLED', 'COMPLETED'],
      SETTLED: ['PROCESSING', 'COMPLETED'],
      PROCESSING: ['COMPLETED', 'PENDING'],
      COMPLETED: [],
    };

    const sb = getSupabase();
    const { data: existing, error: fetchErr } = await sb
      .from('Invoice')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      res.status(404).json({ success: false, error: { message: 'Invoice not found', code: 'NOT_FOUND' } });
      return;
    }

    if (!VALID_TRANSITIONS[existing.status]?.includes(status)) {
      res.status(400).json({
        success: false,
        error: { message: `Invalid transition: ${existing.status} → ${status}`, code: 'INVALID_TRANSITION' },
      });
      return;
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = { status, updatedAt: now };
    if (status === 'SETTLED') updateData.settledAt = now;
    if (status === 'COMPLETED') updateData.completedAt = now;

    const { data, error } = await sb
      .from('Invoice')
      .update(updateData)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single();

    if (error) throw error;
    res.json({ success: true, data: mapInvoice(data) });
  } catch (err) {
    next(err);
  }
});

export default router;
