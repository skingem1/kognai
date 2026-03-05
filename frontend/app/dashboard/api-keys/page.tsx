'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

interface ApiKeyRecord {
  id: string;
  customerId: string;
  customerEmail: string;
  keyPrefix: string;
  name: string;
  tier: string;
  plan: string;
  permissions: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function KeyRevealModal({
  keyValue,
  keyName,
  onClose,
}: {
  keyValue: string;
  keyName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = keyValue;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Key Created</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Key <span className="font-medium text-gray-700">&ldquo;{keyName}&rdquo;</span> was created successfully
            </p>
          </div>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Copy this key now.</span> For security reasons, it will never be shown again after you close this dialog.
          </p>
        </div>

        {/* Key display */}
        <div className="bg-gray-950 rounded-xl px-4 py-3.5 mb-4 flex items-center gap-3">
          <code className="text-xs text-green-400 font-mono break-all flex-1 leading-relaxed">
            {keyValue}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>

        {/* Store hint */}
        <p className="text-xs text-gray-500 mb-5 text-center">
          Store this key in your environment variables or secrets manager.
        </p>

        <button
          onClick={onClose}
          className="w-full bg-[#635BFF] hover:bg-[#5147e6] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Done — I&apos;ve saved my key
        </button>
      </div>
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
  userId,
}: {
  onClose: () => void;
  onCreated: (keyValue: string, keyName: string) => void;
  userId: string;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Key name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/v1/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: userId,
          name: name.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to create key');
      }
      const keyData = json.data;
      if (!keyData.key) {
        throw new Error('Server did not return key value');
      }
      onCreated(keyData.key, name.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Create API Key</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Key Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production, Staging, My Agent..."
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent transition-shadow"
              autoFocus
              maxLength={100}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              A descriptive name to identify where this key is used.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-[#635BFF] hover:bg-[#5147e6] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </>
              ) : (
                'Create Key'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const { user, loading: authLoading } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ value: string; name: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/v1/api-keys`, {
        headers: { 'x-customer-id': user.id },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to load keys');
      setKeys(json.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchKeys();
    }
  }, [authLoading, user?.id, fetchKeys]);

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    setRevokingId(id);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/api-keys/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to revoke key');
      // Refresh keys list
      await fetchKeys();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevokingId(null);
    }
  };

  const handleKeyCreated = (keyValue: string, keyName: string) => {
    setShowCreateModal(false);
    setCreatedKey({ value: keyValue, name: keyName });
  };

  const handleRevealClose = () => {
    setCreatedKey(null);
    fetchKeys(); // Refresh list after closing reveal modal
  };

  const activeKeys = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* BETA Banner */}
      <div className="flex items-center gap-3 bg-[#635BFF]/10 border border-[#635BFF]/20 rounded-xl px-4 py-3 mb-6">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#635BFF] text-white shrink-0">
          BETA
        </span>
        <p className="text-sm text-[#635BFF] font-medium">
          You&apos;re using Invoica during our private beta — all features are free.
        </p>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage keys for your integrations and agents.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#635BFF] hover:bg-[#5147e6] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Key
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={fetchKeys} className="ml-auto text-xs text-red-500 underline">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm animate-pulse">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-48" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-40 font-mono" />
              <div className="h-4 bg-gray-200 rounded w-24 ml-auto" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && keys.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 bg-[#635BFF]/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">No API keys yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first key to start using the Invoica API.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-[#635BFF] hover:bg-[#5147e6] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create your first key
          </button>
        </div>
      )}

      {/* Active Keys */}
      {!loading && !error && activeKeys.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-4">
          <div className="px-6 py-3.5 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Active Keys ({activeKeys.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {activeKeys.map((key) => (
              <div key={key.id} className="px-6 py-4 flex items-center gap-4 group hover:bg-gray-50/50 transition-colors">
                {/* Key icon */}
                <div className="w-8 h-8 rounded-lg bg-[#635BFF]/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                </div>

                {/* Name + key preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{key.name}</p>
                  <code className="text-xs text-gray-500 font-mono">
                    sk_<span className="text-gray-400">{key.keyPrefix}</span>••••••••••••••••
                  </code>
                </div>

                {/* Meta */}
                <div className="hidden sm:flex items-center gap-6 text-xs text-gray-500 shrink-0">
                  <div className="text-right">
                    <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium">Created</p>
                    <p className="text-gray-600 font-medium">{formatDate(key.createdAt)}</p>
                  </div>
                  {key.lastUsedAt && (
                    <div className="text-right">
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium">Last used</p>
                      <p className="text-gray-600 font-medium">{formatDate(key.lastUsedAt)}</p>
                    </div>
                  )}
                  {key.expiresAt && (
                    <div className="text-right">
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-medium">Expires</p>
                      <p className="text-amber-600 font-medium">{formatDate(key.expiresAt)}</p>
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 shrink-0">
                  Active
                </span>

                {/* Revoke button */}
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={revokingId === key.id}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs text-red-500 hover:text-red-700 font-medium transition-all disabled:opacity-50 shrink-0"
                  title="Revoke this key"
                >
                  {revokingId === key.id ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    'Revoke'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revoked Keys */}
      {!loading && !error && revokedKeys.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm opacity-70">
          <div className="px-6 py-3.5 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Revoked Keys ({revokedKeys.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {revokedKeys.map((key) => (
              <div key={key.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-500 truncate line-through">{key.name}</p>
                  <code className="text-xs text-gray-400 font-mono">
                    sk_<span>{key.keyPrefix}</span>••••••••••••••••
                  </code>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-xs text-gray-400 shrink-0">
                  <div className="text-right">
                    <p className="text-gray-300 uppercase tracking-wide text-[10px] font-medium">Revoked</p>
                    <p className="font-medium">{formatDate(key.updatedAt)}</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-500 shrink-0">
                  Revoked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security note */}
      {!loading && !error && keys.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-center">
          API keys grant full access to the Invoica API on behalf of your account. Keep them secret and never commit them to version control.
        </p>
      )}

      {/* Modals */}
      {showCreateModal && user?.id && (
        <CreateKeyModal
          userId={user.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleKeyCreated}
        />
      )}
      {createdKey && (
        <KeyRevealModal
          keyValue={createdKey.value}
          keyName={createdKey.name}
          onClose={handleRevealClose}
        />
      )}
    </div>
  );
}
