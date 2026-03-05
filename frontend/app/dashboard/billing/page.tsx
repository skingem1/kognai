'use client';

import { useEffect, useState } from 'react';
import { fetchBillingStatus, createCheckoutSession, createPortalSession, type BillingStatus } from '@/lib/api-client';

const PLAN_LIMITS: Record<string, { invoices: number; apiCalls: number }> = {
  free: { invoices: 100, apiCalls: 10000 },
  pro: { invoices: 10000, apiCalls: 500000 },
  enterprise: { invoices: Infinity, apiCalls: Infinity },
};

const PLAN_PRICES: Record<string, string> = {
  free: '$0',
  pro: '$49',
  enterprise: 'Custom',
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    trialing: 'bg-blue-100 text-blue-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    canceled: 'bg-red-100 text-red-800',
    incomplete: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${colors[status] || colors.incomplete}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

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
          className={`h-2 rounded-full transition-all ${isHigh ? 'bg-orange-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBilling();
  }, []);

  async function loadBilling() {
    try {
      setLoading(true);
      const data = await fetchBillingStatus();
      setBilling(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load billing info');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade() {
    try {
      setActionLoading(true);
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create checkout session');
      setActionLoading(false);
    }
  }

  async function handleManage() {
    try {
      setActionLoading(true);
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Billing</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-100 rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-gray-100 rounded-lg" />
            <div className="h-20 bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !billing) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Billing</h1>
        <div className="border border-red-200 bg-red-50 rounded-lg p-6 text-center">
          <p className="text-red-600 mb-3">{error}</p>
          <button onClick={loadBilling} className="text-sky-600 hover:underline text-sm">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const plan = billing?.subscription_plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const isFree = plan === 'free';
  const isPro = plan === 'pro';

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Billing</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Current Plan */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
        <div className="border rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-xl font-bold capitalize">{plan} Plan</h3>
                <StatusBadge status={billing?.subscription_status || 'active'} />
              </div>
              <p className="text-gray-500 text-sm">
                {PLAN_PRICES[plan]}{plan !== 'enterprise' ? '/month' : ''}
                {plan !== 'free' && ' • '}
                {plan !== 'free' && `Up to ${limits.invoices.toLocaleString()} invoices/month`}
                {isFree && ' • Up to 100 invoices/month'}
              </p>
            </div>
          </div>

          {billing?.subscription_period_end && (
            <p className="text-xs text-gray-400 mb-4">
              {billing.subscription_status === 'canceled' ? 'Access until' : 'Next billing date'}:{' '}
              {new Date(billing.subscription_period_end).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}

          <div className="flex gap-3">
            {isFree && (
              <button
                onClick={handleUpgrade}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {actionLoading ? 'Redirecting...' : 'Upgrade to Pro — $49/mo'}
              </button>
            )}
            {(isPro || plan === 'enterprise') && billing?.stripe_customer_id && (
              <button
                onClick={handleManage}
                disabled={actionLoading}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {actionLoading ? 'Redirecting...' : 'Manage Subscription'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Usage */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Usage This Month</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UsageBar
            used={billing?.invoice_count_this_month || 0}
            limit={limits.invoices}
            label="Invoices Created"
          />
          <UsageBar
            used={billing?.api_call_count_this_month || 0}
            limit={limits.apiCalls}
            label="API Calls"
          />
        </div>
      </section>

      {/* Pro Features Upsell (only on free) */}
      {isFree && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Why Upgrade?</h2>
          <div className="border rounded-lg p-6 bg-gradient-to-br from-sky-50 to-blue-50">
            <ul className="space-y-3">
              {[
                '10,000 invoices per month',
                'Multi-jurisdiction tax compliance',
                'Budget enforcement for agents',
                'Priority webhook delivery',
                'Advanced analytics dashboard',
                'Email support',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
                  <svg className="w-5 h-5 text-sky-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={actionLoading}
              className="mt-6 px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {actionLoading ? 'Redirecting...' : 'Upgrade to Pro — $49/mo'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
