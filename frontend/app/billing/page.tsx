'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchBillingStatus, type BillingStatus } from '@/lib/api-client';

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit === Infinity ? 0 : Math.min((used / limit) * 100, 100);
  const isHigh = pct > 80;
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-baseline mb-2">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xs text-gray-400">
          {used.toLocaleString()} / {limit === Infinity ? '∞' : limit.toLocaleString()}
        </p>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${isHigh ? 'bg-orange-500' : 'bg-[#635BFF]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBilling = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchBillingStatus();
      setBilling(data);
    } catch {
      // silently fail — usage shows zeros
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Billing</h1>
      <p className="text-sm text-gray-500 mb-8">Your usage and plan details</p>

      {/* Beta Banner */}
      <div className="mb-8 rounded-xl border border-[#635BFF]/20 bg-gradient-to-br from-[#635BFF]/5 to-[#818CF8]/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#635BFF]/10 border border-[#635BFF]/20 text-xs font-semibold text-[#635BFF] uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[#635BFF] animate-pulse" />
              Beta
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Free during beta</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Invoica is currently in private beta. All features are free to use.
              Pricing tiers will be announced at the end of the beta period — and early adopters
              will receive preferential rates.
            </p>
          </div>
        </div>
      </div>

      {/* Current Plan */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xl font-bold">Beta Plan</h3>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              Active
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-1">Free &mdash; All features included</p>
          <p className="text-xs text-gray-400">
            Founding member status locked in &mdash; pricing announced post-beta
          </p>
        </div>
      </section>

      {/* Usage */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Usage This Month</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UsageBar
              used={billing?.invoice_count_this_month || 0}
              limit={Infinity}
              label="Invoices Created"
            />
            <UsageBar
              used={billing?.api_call_count_this_month || 0}
              limit={Infinity}
              label="API Calls"
            />
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          No limits apply during beta &mdash; unlimited usage for all early adopters.
        </p>
      </section>
    </div>
  );
}
