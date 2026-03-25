/**
 * cmd-revenue.ts — /revenue command (LemonSqueezy subscribers)
 * Sprint 1239 / LEMON-SCAFFOLD-02
 *
 * Queries Supabase subscribers table to show:
 * - Count of active subscriptions
 * - MRR estimate
 * - Recent subscriber activity
 */

import { createClient } from '@supabase/supabase-js';

const PLAN_PRICE_EUR: Record<string, number> = {
  default: 9,
};

function getPlanPrice(plan: string): number {
  return PLAN_PRICE_EUR[plan] ?? PLAN_PRICE_EUR['default'] ?? 9;
}

export async function cmdLemonRevenue(): Promise<string> {
  const url = process.env['SUPABASE_URL']         ?? '';
  const key = process.env['SUPABASE_SERVICE_KEY'] ?? process.env['SUPABASE_KEY'] ?? '';

  if (!url || !key) {
    return '💰 *LemonSqueezy Revenue*\n\n⚠️ Supabase not configured. Set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in .env';
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('subscribers')
      .select('plan, status, activated_at')
      .order('activated_at', { ascending: false });

    if (error) throw new Error(error.message);

    const subs = (data ?? []) as Array<{ plan: string; status: string; activated_at: string }>;
    const active = subs.filter(s => s.status === 'active');
    const mrr    = active.reduce((sum, s) => sum + getPlanPrice(s.plan), 0);

    const recent7d = active.filter(s => {
      const d = new Date(s.activated_at);
      return (Date.now() - d.getTime()) < 7 * 86_400_000;
    });

    return [
      `💰 *LemonSqueezy Revenue*`,
      ``,
      `Active subscribers: *${active.length}*`,
      `MRR estimate: *€${mrr}/mo*`,
      `New (7d): *${recent7d.length}*`,
      `Total ever: *${subs.length}*`,
      ``,
      `_Use /subscribe to share checkout link_`,
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `💰 *LemonSqueezy Revenue*\n\n❌ Query failed: ${msg.slice(0, 200)}`;
  }
}
