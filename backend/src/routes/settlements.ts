import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

router.get('/v1/settlements/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sb = getSupabase();
    const { data, error } = await sb
      .from('Invoice')
      .select('id, invoiceNumber, status, amount, currency, customerEmail, customerName, paymentDetails, settledAt, completedAt, createdAt, updatedAt')
      .eq('id', id)
      .in('status', ['SETTLED', 'PROCESSING', 'COMPLETED'])
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { message: 'Settlement not found', code: 'NOT_FOUND' } });
      return;
    }

    const pd = typeof data.paymentDetails === 'string' ? JSON.parse(data.paymentDetails) : (data.paymentDetails || {});
    res.json({
      success: true,
      data: {
        id: data.id,
        invoiceId: data.id,
        invoiceNumber: data.invoiceNumber,
        status: data.status === 'COMPLETED' ? 'confirmed' : 'pending',
        amount: data.amount,
        currency: data.currency,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        txHash: pd.txHash || null,
        network: pd.network || 'base-mainnet',
        paidBy: pd.paidBy || null,
        settledAt: data.settledAt,
        completedAt: data.completedAt,
        createdAt: data.createdAt,
      }
    });
  } catch (err) { next(err); }
});

router.get('/v1/settlements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10) || 20, 100);
    const offset = parseInt(req.query.offset as string || '0', 10) || 0;
    const statusFilter = req.query.status as string;

    const sb = getSupabase();
    let query = sb
      .from('Invoice')
      .select('id, invoiceNumber, status, amount, currency, customerEmail, customerName, paymentDetails, settledAt, completedAt, createdAt, updatedAt', { count: 'exact' })
      .in('status', ['SETTLED', 'PROCESSING', 'COMPLETED'])
      .order('settledAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter === 'confirmed') {
      query = query.eq('status', 'COMPLETED');
    } else if (statusFilter === 'pending') {
      query = query.in('status', ['SETTLED', 'PROCESSING']);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const settlements = (data || []).map(inv => {
      const pd = typeof inv.paymentDetails === 'string' ? JSON.parse(inv.paymentDetails) : (inv.paymentDetails || {});
      return {
        id: inv.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status === 'COMPLETED' ? 'confirmed' : 'pending',
        amount: inv.amount,
        currency: inv.currency,
        customerName: inv.customerName,
        customerEmail: inv.customerEmail,
        txHash: pd.txHash || null,
        network: pd.network || 'base-mainnet',
        paidBy: pd.paidBy || null,
        settledAt: inv.settledAt,
        completedAt: inv.completedAt,
        createdAt: inv.createdAt,
      };
    });

    const total = count || 0;
    res.json({
      success: true,
      data: settlements,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      }
    });
  } catch (err) { next(err); }
});

export default router;
