'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive';
  created_at: string;
  secret?: string;
}

const ALL_EVENTS = [
  { value: 'invoice.created', label: 'Invoice Created', desc: 'A new invoice is generated' },
  { value: 'invoice.paid', label: 'Invoice Paid', desc: 'Payment confirmed for an invoice' },
  { value: 'invoice.overdue', label: 'Invoice Overdue', desc: 'Invoice payment deadline passed' },
  { value: 'invoice.cancelled', label: 'Invoice Cancelled', desc: 'An invoice is cancelled' },
  { value: 'settlement.completed', label: 'Settlement Completed', desc: 'x402 settlement confirmed on-chain' },
  { value: 'settlement.failed', label: 'Settlement Failed', desc: 'Settlement attempt failed' },
  { value: 'agent.transaction', label: 'Agent Transaction', desc: 'An agent initiates a payment' },
  { value: 'payment.received', label: 'Payment Received', desc: 'Incoming payment detected' },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Form state
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadWebhooks = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('Webhook')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setWebhooks(data || []);
    } catch {
      // silent fail — empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!url.trim()) { setFormError('URL is required'); return; }
    if (!url.startsWith('https://')) { setFormError('URL must start with https://'); return; }
    if (selectedEvents.length === 0) { setFormError('Select at least one event'); return; }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const secret = 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');

      const { data, error } = await supabase.from('Webhook').insert({
        user_id: user.id,
        url: url.trim(),
        events: selectedEvents,
        status: 'active',
        secret,
      }).select().single();

      if (error) throw error;

      setWebhooks((prev) => [data, ...prev]);
      setNewSecret(secret);
      setUrl('');
      setSelectedEvents([]);
      setShowModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const supabase = createClient();
      await supabase.from('Webhook').delete().eq('id', id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggle(webhook: Webhook) {
    setToggling(webhook.id);
    const newStatus = webhook.status === 'active' ? 'inactive' : 'active';
    try {
      const supabase = createClient();
      await supabase.from('Webhook').update({ status: newStatus }).eq('id', webhook.id);
      setWebhooks((prev) => prev.map((w) => w.id === webhook.id ? { ...w, status: newStatus } : w));
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">Receive real-time event notifications at your endpoints</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(''); setNewSecret(null); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Webhook
        </button>
      </div>

      {/* New secret banner */}
      {newSecret && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 mb-1">Save your webhook secret — it won&apos;t be shown again</p>
              <code className="text-xs font-mono bg-white border border-amber-200 px-3 py-1.5 rounded-lg block break-all text-amber-900">
                {newSecret}
              </code>
              <p className="text-xs text-amber-700 mt-2">Use this to verify webhook signatures from Invoica.</p>
            </div>
            <button onClick={() => setNewSecret(null)} className="text-amber-500 hover:text-amber-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">No webhooks yet</p>
          <p className="text-sm text-gray-400 mb-6">Add an endpoint to start receiving event notifications</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all"
          >
            Add your first webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      webhook.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${webhook.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {webhook.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <code className="text-sm text-gray-800 font-mono truncate max-w-sm">{webhook.url}</code>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {webhook.events.map((ev) => (
                      <span key={ev} className="px-2 py-0.5 bg-[#635BFF]/8 text-[#635BFF] rounded text-xs font-medium border border-[#635BFF]/15">
                        {ev}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Added {new Date(webhook.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(webhook)}
                    disabled={toggling === webhook.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    {toggling === webhook.id ? '...' : webhook.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    disabled={deleting === webhook.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting === webhook.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add webhook modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Add Webhook</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Endpoint URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-server.com/webhooks/invoica"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#635BFF] focus:border-transparent outline-none"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Must be HTTPS. Invoica will POST JSON events to this URL.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Events to subscribe <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {ALL_EVENTS.map((event) => (
                    <label
                      key={event.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedEvents.includes(event.value)
                          ? 'border-[#635BFF]/40 bg-[#635BFF]/5'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event.value)}
                        onChange={() => toggleEvent(event.value)}
                        className="mt-0.5 accent-[#635BFF]"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{event.label}</p>
                        <p className="text-xs text-gray-500">{event.desc}</p>
                        <code className="text-xs text-[#635BFF] font-mono">{event.value}</code>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#635BFF] to-[#818CF8] text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Webhook'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
