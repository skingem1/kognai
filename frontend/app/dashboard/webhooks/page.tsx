'use client';

import React from 'react';

interface Webhook {
  id: string;
  url: string;
  events: string;
  status: 'Active' | 'Failing';
  lastDelivery: string;
}

const webhooks: Webhook[] = [
  { id: '1', url: 'https://api.acme.com/webhooks', events: 'invoice.created, invoice.paid', status: 'Active', lastDelivery: '2 minutes ago' },
  { id: '2', url: 'https://staging.acme.com/hooks', events: 'invoice.created, settlement.created', status: 'Active', lastDelivery: '3 hours ago' },
  { id: '3', url: 'https://old.acme.com/notify', events: 'invoice.updated', status: 'Failing', lastDelivery: 'Failed 1 day ago' },
];

export default function DashboardWebhooksPage() {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">+ Add Endpoint</button>
      </div>
      <div>
        {webhooks.map((wh) => (
          <div key={wh.id} className="bg-white rounded-lg shadow p-6 mb-4">
            <div className="flex justify-between">
              <div>
                <h3 className="text-sm font-mono">{wh.url}</h3>
                <p className="text-xs text-gray-500 mt-1">{wh.events}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${wh.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{wh.status}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Last delivery: {wh.lastDelivery}</p>
          </div>
        ))}
      </div>
    </div>
  );
}