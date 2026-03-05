import { supabase } from '../lib/supabase';

export interface Settlement {
  merchant_id: string;
  period_start: string;
  period_end: string;
  total_invoices: number;
  total_amount: number;
  currency: string;
  usdc_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface InvoiceRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

/**
 * Generates a settlement report for a merchant within a date range.
 * Queries paid invoices, aggregates totals, and converts to USDC.
 */
export async function generateSettlementReport(
  merchantId: string,
  startDate: Date,
  endDate: Date
): Promise<Settlement> {
  const { data: invoices, error } = await supabase
    .from<InvoiceRow>('invoices')
    .select('id, amount, currency, status, created_at')
    .eq('merchant_id', merchantId)
    .eq('status', 'paid')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) throw new Error(`Failed to query invoices: ${error.message}`);

  const totalInvoices = invoices?.length ?? 0;
  const totalAmount = invoices?.reduce((sum, inv) => sum + (inv.amount ?? 0), 0) ?? 0;
  const currency = invoices?.[0]?.currency ?? 'USD';
  const usdcAmount = totalAmount; // Conversion logic to be implemented with exchange service

  const settlement: Settlement = {
    merchant_id: merchantId,
    period_start: startDate.toISOString(),
    period_end: endDate.toISOString(),
    total_invoices: totalInvoices,
    total_amount: totalAmount,
    currency,
    usdc_amount: usdcAmount,
    status: totalAmount > 0 ? 'pending' : 'completed'
  };

  return settlement;
}

/**
 * Fetches recent settlement history for a merchant.
 */
export async function getSettlementHistory(
  merchantId: string,
  limit: number = 10
): Promise<Settlement[]> {
  const { data: settlements, error } = await supabase
    .from<Settlement>('settlements')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('period_end', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch settlements: ${error.message}`);

  return settlements ?? [];
}
