'use client';

import { useState } from 'react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'Active' | 'Paused';
  restartState: 'idle' | 'restarting' | 'done';
}

const AGENTS: Omit<Agent, 'restartState'>[] = [
  {
    id: '1',
    name: 'Invoice Processor',
    role: 'Automatically generates and validates x402-compliant invoices when your agents complete tasks.',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Payment Monitor',
    role: 'Tracks payment statuses in real-time and triggers webhooks when invoice states change.',
    status: 'Active',
  },
  {
    id: '3',
    name: 'Settlement Agent',
    role: 'Handles x402 transaction settlement, verifies on-chain confirmations, and updates ledger records.',
    status: 'Active',
  },
  {
    id: '4',
    name: 'Webhook Dispatcher',
    role: 'Delivers event notifications to your registered webhook endpoints with automatic retry on failure.',
    status: 'Active',
  },
  {
    id: '5',
    name: 'Tax Compliance Agent',
    role: 'Attaches jurisdiction-aware tax metadata to invoices and generates compliance reports.',
    status: 'Active',
  },
  {
    id: '6',
    name: 'Analytics Agent',
    role: 'Aggregates transaction data and generates spending insights, cash flow forecasts, and usage trends.',
    status: 'Active',
  },
];

function StatusBadge({ status }: { status: Agent['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'Active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
      {status}
    </span>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(
    AGENTS.map((a) => ({ ...a, restartState: 'idle' as const }))
  );

  const toggleAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === 'Active' ? 'Paused' : 'Active' } : a
      )
    );
  };

  const restartAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, restartState: 'restarting', status: 'Active' } : a))
    );
    setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, restartState: 'done' } : a))
      );
      setTimeout(() => {
        setAgents((prev) =>
          prev.map((a) => (a.id === id ? { ...a, restartState: 'idle' } : a))
        );
      }, 1500);
    }, 1200);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="mt-2 text-gray-500">
          Monitor and manage the agents that automate your invoicing and payment workflows.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 pr-2">{agent.name}</h3>
              <StatusBadge status={agent.status} />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">{agent.role}</p>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAgent(agent.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  agent.status === 'Active'
                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100'
                    : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                }`}
              >
                {agent.status === 'Active' ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => restartAgent(agent.id)}
                disabled={agent.restartState === 'restarting'}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  agent.restartState === 'done'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                } disabled:opacity-60`}
              >
                {agent.restartState === 'restarting' && (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {agent.restartState === 'done' && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {agent.restartState === 'restarting' ? 'Restarting...' : agent.restartState === 'done' ? 'Restarted' : 'Restart'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Agent state is session-based &mdash; changes persist until you reload the page.
        Persistent agent control is coming in a future update.
      </p>
    </div>
  );
}
