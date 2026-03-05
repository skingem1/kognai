'use client';

import { useState, useEffect, useCallback } from 'react';

// Empty string = relative path, handled by Next.js rewrites (no mixed content)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const KEY_STORAGE  = 'invoica_api_key';
const VERIFIED_STORAGE = 'invoica_ledger_verified';

type Step = 'enter-key' | 'enter-code' | 'loading' | 'ready' | 'error';

interface LedgerEntry {
  id: string;
  invoiceNumber: number;
  date: string;
  agentId: string;
  agentName: string;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  status: string;
  txHash: string | null;
  network: string | null;
}

interface AgentBalance {
  agentId: string;
  agentName: string;
  debit: number;
  credit: number;
  net: number;
  currency: string;
  txCount: number;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    COMPLETED:  'bg-green-50 text-green-700',
    SETTLED:    'bg-blue-50  text-blue-700',
    PROCESSING: 'bg-yellow-50 text-yellow-700',
    PENDING:    'bg-gray-50  text-gray-600',
    REFUNDED:   'bg-red-50   text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-50 text-gray-600'}`}>
      {status}
    </span>
  );
}

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

export default function LedgerPage() {
  const [step, setStep]           = useState<Step>('loading');
  const [apiKey, setApiKey]       = useState('');
  const [code, setCode]           = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError]         = useState('');
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab]             = useState<'ledger' | 'balances'>('ledger');
  const [entries, setEntries]     = useState<LedgerEntry[]>([]);
  const [agents, setAgents]       = useState<AgentBalance[]>([]);
  const [meta, setMeta]           = useState({ total: 0, limit: 50, offset: 0, hasMore: false });
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem(KEY_STORAGE);
    const verified  = sessionStorage.getItem(VERIFIED_STORAGE);
    if (storedKey && verified === 'true') {
      fetchLedger(storedKey);
    } else {
      setStep('enter-key');
    }
  }, []);

  const fetchLedger = useCallback(async (key: string) => {
    setStep('loading');
    setLoadingData(true);
    try {
      const [ledgerRes, summaryRes] = await Promise.all([
        fetch(`${BACKEND_URL}/v1/ledger?limit=50&offset=0`, { headers: { Authorization: `Bearer ${key}` } }),
        fetch(`${BACKEND_URL}/v1/ledger/summary`,           { headers: { Authorization: `Bearer ${key}` } }),
      ]);
      if (ledgerRes.status === 401) {
        localStorage.removeItem(KEY_STORAGE);
        sessionStorage.removeItem(VERIFIED_STORAGE);
        setStep('enter-key');
        setError('API key is no longer valid. Please enter a new key.');
        return;
      }
      const ledgerData  = await ledgerRes.json();
      const summaryData = await summaryRes.json();
      setEntries(ledgerData.data  || []);
      setMeta(ledgerData.meta    || { total: 0, limit: 50, offset: 0, hasMore: false });
      setAgents(summaryData.data || []);
      setStep('ready');
    } catch {
      setError('Failed to load ledger data. Please try again.');
      setStep('error');
    } finally {
      setLoadingData(false);
    }
  }, []);

  async function handleSendCode() {
    if (!apiKey.trim()) { setError('Please enter your API key'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/v1/ledger/send-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Failed to send verification code');
        return;
      }
      // Web3 / agent key — no email, skip OTP entirely
      if (data.data.skipVerification && data.data.bypassCode) {
        await handleAutoVerify(data.data.bypassCode);
        return;
      }
      setMaskedEmail(data.data.maskedEmail);
      setStep('enter-code');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleAutoVerify(bypassCode: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/v1/ledger/confirm-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), code: bypassCode }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem(KEY_STORAGE, apiKey.trim());
        sessionStorage.setItem(VERIFIED_STORAGE, 'true');
        fetchLedger(apiKey.trim());
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) { setError('Please enter the verification code'); return; }
    setVerifying(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/v1/ledger/confirm-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Invalid code. Please try again.');
        return;
      }
      localStorage.setItem(KEY_STORAGE, apiKey.trim());
      sessionStorage.setItem(VERIFIED_STORAGE, 'true');
      fetchLedger(apiKey.trim());
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleExportCSV() {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) return;
    const res = await fetch(`${BACKEND_URL}/v1/ledger/export.csv`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) { alert('Export failed'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `invoica-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSwitchKey() {
    localStorage.removeItem(KEY_STORAGE);
    sessionStorage.removeItem(VERIFIED_STORAGE);
    setApiKey(''); setCode(''); setError(''); setMaskedEmail('');
    setStep('enter-key');
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#635BFF] border-t-transparent" />
      </div>
    );
  }

  if (step === 'enter-key') {
    return (
      <div className="max-w-md mx-auto mt-12">
        {/* Beta banner */}
        <div className="mb-4 flex items-center gap-2 bg-[#635BFF]/10 border border-[#635BFF]/20 rounded-xl px-4 py-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#635BFF] text-white">BETA</span>
          <p className="text-sm text-[#635BFF] font-medium">You're using Invoica during our private beta. All features are free while we're in beta.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#635BFF]/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#635BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Access Company Ledger</h1>
              <p className="text-sm text-gray-500">Enter any company API key to begin</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSendCode()}
                placeholder="sk_..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#635BFF]/30 focus:border-[#635BFF]"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-gray-400">Any active API key from your company will work.</p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              onClick={handleSendCode}
              disabled={sending || !apiKey.trim()}
              className="w-full py-2.5 bg-[#635BFF] text-white rounded-xl text-sm font-medium hover:bg-[#5249e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {sending
                ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Verifying...</>
                : 'Access Ledger'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'enter-code') {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Check your email</h1>
              <p className="text-sm text-gray-500">We sent a 6-digit code to <strong>{maskedEmail}</strong></p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                placeholder="123456"
                maxLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-mono text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/30 focus:border-[#635BFF]"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-gray-400">Code expires in 10 minutes.</p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              onClick={handleVerifyCode}
              disabled={verifying || code.length !== 6}
              className="w-full py-2.5 bg-[#635BFF] text-white rounded-xl text-sm font-medium hover:bg-[#5249e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {verifying
                ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Verifying...</>
                : 'Confirm Access'}
            </button>
            <button onClick={() => { setStep('enter-key'); setCode(''); setError(''); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Back to key entry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => setStep('enter-key')} className="text-[#635BFF] underline text-sm">Try again</button>
      </div>
    );
  }

  const totalDebits  = entries.reduce((s, e) => s + e.debit,  0);
  const totalCredits = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <div className="space-y-6">
      {/* Beta banner */}
      <div className="flex items-center gap-3 bg-[#635BFF]/[0.06] border border-[#635BFF]/15 rounded-xl px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#635BFF] text-white shrink-0">BETA</span>
        <p className="text-sm text-[#635BFF]">You're in the private beta. All Invoica features are <strong>free during beta</strong>. No upgrade required.</p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">Immutable record of all agent transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSwitchKey} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Switch key</button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Agents',  value: agents.length.toString(), sub: 'with transactions' },
          { label: 'Total Debits',  value: fmt(totalDebits),          sub: 'across all agents' },
          { label: 'Total Entries', value: meta.total.toString(),     sub: 'transaction records' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500 font-medium">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['ledger', 'balances'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'ledger' ? 'Transaction Ledger' : 'Agent Balances'}
          </button>
        ))}
      </div>

      {tab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Date', 'Invoice #', 'Agent', 'Description', 'Debit', 'Credit', 'Status', 'TxHash'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">No transactions found for this company.</td></tr>
                  : entries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(e.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">#{e.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate" title={e.agentName}>{e.agentName}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={e.description}>{e.description || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.debit > 0 ? fmt(e.debit, e.currency) : '—'}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{e.credit > 0 ? fmt(e.credit, e.currency) : '—'}</td>
                      <td className="px-4 py-3">{statusBadge(e.status)}</td>
                      <td className="px-4 py-3">
                        {e.txHash
                          ? <a href={`https://basescan.org/tx/${e.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[#635BFF] hover:underline">{e.txHash.slice(0, 8)}...{e.txHash.slice(-4)}</a>
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/50">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Totals</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{fmt(totalDebits)}</td>
                    <td className="px-4 py-3 font-bold text-green-700">{fmt(totalCredits)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {tab === 'balances' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Agent', 'Transactions', 'Total Debits', 'Total Credits', 'Net Balance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.length === 0
                  ? <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">No agent data found.</td></tr>
                  : agents.map(a => (
                    <tr key={a.agentId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{a.agentName}</div>
                        <div className="text-xs text-gray-400 font-mono">{a.agentId}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{a.txCount}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{fmt(a.debit, a.currency)}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{fmt(a.credit, a.currency)}</td>
                      <td className={`px-4 py-3 font-bold ${a.net >= 0 ? 'text-gray-900' : 'text-green-700'}`}>
                        {fmt(Math.abs(a.net), a.currency)}{a.net < 0 ? ' CR' : ''}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
