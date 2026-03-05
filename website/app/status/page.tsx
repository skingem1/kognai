'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface ServiceStatus {
  name: string;
  description: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  responseTime?: number;
}

const API_URL = 'https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnc3BvcG9lamhzeHZ3dnh5aGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0ODQzNTksImV4cCI6MjA4NzA2MDM1OX0.a0P9MHW7fXD2LfjHq-fSs_pLsefUpNAivDn7qbM91v8';

async function checkService(url: string, timeout = 10000): Promise<{ ok: boolean; ms: number }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    clearTimeout(id);
    return { ok: res.ok, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

function StatusDot({ status }: { status: ServiceStatus['status'] }) {
  const colors: Record<string, string> = {
    operational: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
    checking: 'bg-gray-400 animate-pulse',
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

function StatusLabel({ status }: { status: ServiceStatus['status'] }) {
  const styles: Record<string, string> = {
    operational: 'text-emerald-600',
    degraded: 'text-amber-600',
    down: 'text-red-600',
    checking: 'text-gray-400',
  };
  const labels: Record<string, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    down: 'Outage',
    checking: 'Checking...',
  };
  return <span className={`text-sm font-medium ${styles[status]}`}>{labels[status]}</span>;
}

export default function PublicStatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'API Gateway', description: 'REST API for invoices, settlements, and billing', status: 'checking' },
    { name: 'Authentication', description: 'User login and session management', status: 'checking' },
    { name: 'Dashboard', description: 'Web application at app.invoica.ai', status: 'checking' },
    { name: 'Documentation', description: 'Developer docs and API reference', status: 'checking' },
  ]);
  const [lastChecked, setLastChecked] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setRefreshing(true);
    const [api, auth, dash, docs] = await Promise.all([
      checkService(`${API_URL}/v1/health`),
      checkService(`https://igspopoejhsxvwvxyhbh.supabase.co/auth/v1/health?apikey=${SUPABASE_ANON_KEY}`),
      checkService('https://app.invoica.ai'),
      checkService('https://invoica.mintlify.app'),
    ]);

    setServices([
      { name: 'API Gateway', description: 'REST API for invoices, settlements, and billing', status: api.ok ? 'operational' : 'down', responseTime: api.ms },
      { name: 'Authentication', description: 'User login and session management', status: auth.ok ? 'operational' : 'down', responseTime: auth.ms },
      { name: 'Dashboard', description: 'Web application at app.invoica.ai', status: dash.ok ? 'operational' : 'down', responseTime: dash.ms },
      { name: 'Documentation', description: 'Developer docs and API reference', status: docs.ok ? 'operational' : 'down', responseTime: docs.ms },
    ]);

    setLastChecked(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setRefreshing(false);
  }, []);

  useEffect(() => {
    runChecks();
    const interval = setInterval(runChecks, 60000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const allOk = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'down');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A2540] to-[#0d2f4f]">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo-dark.png" alt="Invoica" width={32} height={32} />
            <span className="text-white font-bold text-lg tracking-tight">Invoica</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="https://invoica-b89o.vercel.app"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="https://invoica.mintlify.app"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Docs
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Overall Status */}
        <div className={`rounded-2xl p-6 mb-10 border ${
          allOk
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : anyDown
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-white/5 border-white/10'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${
              allOk ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : anyDown ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-gray-400 animate-pulse'
            }`} />
            <h1 className="text-2xl font-bold text-white">
              {allOk ? 'All Systems Operational' : anyDown ? 'Partial Outage Detected' : 'Checking Systems...'}
            </h1>
          </div>
          {lastChecked && (
            <p className="text-sm text-white/40 mt-2 ml-7">
              Last checked at {lastChecked} &middot; Auto-refreshes every 60 seconds
            </p>
          )}
        </div>

        {/* Services */}
        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.name}
              className="rounded-xl bg-white/5 border border-white/10 p-5 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <StatusDot status={service.status} />
                  <div>
                    <h3 className="font-semibold text-white">{service.name}</h3>
                    <p className="text-sm text-white/50">{service.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {service.responseTime !== undefined && service.status !== 'checking' && (
                    <span className="text-sm font-mono text-white/40">{service.responseTime}ms</span>
                  )}
                  <StatusLabel status={service.status} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Refresh button */}
        <div className="mt-8 text-center">
          <button
            onClick={runChecks}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Checking...' : 'Refresh Now'}
          </button>
        </div>

        {/* Info */}
        <div className="mt-12 text-center space-y-2">
          <p className="text-xs text-white/30">
            Status checks run from your browser. Response times may vary based on your network.
          </p>
          <p className="text-xs text-white/30">
            For incident reports, contact{' '}
            <a href="mailto:support@invoica.ai" className="text-[#635BFF] hover:underline">
              support@invoica.ai
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Invoica. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="text-xs text-white/30 hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="text-xs text-white/30 hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
