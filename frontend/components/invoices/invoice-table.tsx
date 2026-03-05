'use client';

import React from 'react';

export interface InvoiceRow {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface InvoiceTableProps {
  invoices: InvoiceRow[];
  isLoading?: boolean;
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending') return 'text-amber-600';
  if (s === 'paid' || s === 'completed') return 'text-emerald-600';
  if (s === 'failed') return 'text-red-600';
  return 'text-slate-600';
}

export function InvoiceTable({ invoices, isLoading }: InvoiceTableProps): JSX.Element {
  if (isLoading) return <div>Loading invoices...</div>;

  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td>{inv.number}</td>
            <td>{inv.currency} {inv.amount.toFixed(2)}</td>
            <td><span className={getStatusColor(inv.status)}>{inv.status}</span></td>
            <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
