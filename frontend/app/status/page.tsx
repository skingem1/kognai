'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceStatus {
  name: string;
  description: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  responseTime?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api';
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

function StatusBadge({ status }: { status: ServiceStatus['status'] }) {
  const styles: Record<string, string> = {
    operational: 'bg-green-100 text-green-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    down: 'bg-red-100 text-red-800',
    checking: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    down: 'Outage',
    checking: 'Checking...',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'API Gateway', description: 'Core REST API for invoices, settlements, and billing', status: 'checking' },
    { name: 'Authentication', description: 'User authentication and session management', status: 'checking' },
    { name: 'Dashboard', description: 'Web application and user interface', status: 'checking' },
    { name: 'Documentation', description: 'API documentation and developer guides', status: 'checking' },
  ]);
  const [lastRefresh, setLastRefresh] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setIsRefreshing(true);
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const [api, auth, docs] = await Promise.all([
      checkService(`${API_URL}/v1/health`),
      checkService(`https://igspopoejhsxvwvxyhbh.supabase.co/auth/v1/health?apikey=${SUPABASE_ANON_KEY}`),
      checkService('https://docs.invoica.ai'),
    ]);

    setServices([
      { name: 'API Gateway', description: 'Core REST API for invoices, settlements, and billing', status: api.ok ? 'operational' : 'down', responseTime: api.ms },
      { name: 'Authentication', description: 'User authentication and session management', status: auth.ok ? 'operational' : 'down', responseTime: auth.ms },
      { name: 'Dashboard', description: 'Web application and user interface', status: 'operational', responseTime: 0 },
      { name: 'Documentation', description: 'API documentation and developer guides', status: docs.ok ? 'operational' : 'down', responseTime: docs.ms },
    ]);

    setLastRefresh(now);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    runChecks();
    const interval = setInterval(runChecks, 60000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const allOperational = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'down');
  const overallBg = allOperational ? 'bg-green-50 border-green-200' : anyDown ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
  const overallDot = allOperational ? 'bg-green-500' : anyDown ? 'bg-red-500' : 'bg-gray-400';
  const overallLabel = allOperational ? 'All Systems Operational' : anyDown ? 'Partial Outage Detected' : 'Checking...';

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">System Status</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time health of Invoica services</p>
        </div>
        <button
          onClick={runChecks}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      <div className={`rounded-xl border p-5 mb-8 ${overallBg}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${overallDot} ${allOperational ? 'animate-pulse' : ''}`} />
          <p className="text-lg font-semibold">{overallLabel}</p>
        </div>
        {lastRefresh && (
          <p className="text-xs text-gray-500 mt-2 ml-6">Last checked at {lastRefresh} &middot; Auto-refreshes every 60s</p>
        )}
      </div>

      <div className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{service.name}</h3>
                  <StatusBadge status={service.status} />
                </div>
                <p className="text-sm text-gray-500 mt-1">{service.description}</p>
              </div>
              {service.responseTime !== undefined && service.status !== 'checking' && service.responseTime > 0 && (
                <div className="text-right ml-4">
                  <p className="text-sm font-mono text-gray-600">{service.responseTime}ms</p>
                  <p className="text-xs text-gray-400">response time</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">Status checks run from your browser &middot; Response times vary by location.</p>
        <p className="text-xs text-gray-400 mt-1">
          For support: <a href="mailto:support@invoica.ai" className="text-[#635BFF] hover:underline">support@invoica.ai</a>
        </p>
      </div>
    </div>
  );
}
