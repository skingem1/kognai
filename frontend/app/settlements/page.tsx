'use client';

import { useState, useEffect } from 'react';
import { fetchInvoices, fetchSettlement } from '@/lib/api-client';
import { Invoice } from '@/types';
import { SettlementBadge } from '@/components/settlements/settlement-badge';
import Link from 'next/link';

interface SettlementData {
  status: string;
  tx_hash?: string;
  confirmed_at?: string;
}

export default function SettlementsPage() {
  const [invoices, setInvoices] = useState<{ invoice: Invoice; settlement?: SettlementData }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const invoiceList = await fetchInvoices();
        const settledInvoices = invoiceList.invoices.filter(
          (inv) => inv.status === 'settled' || inv.status === 'completed'
        );

        const invoicesWithSettlements = await Promise.all(
          settledInvoices.map(async (invoice) => {
            try {
              const settlement = await fetchSettlement(invoice.id);
              return { invoice, settlement: settlement as unknown as SettlementData | undefined };
            } catch {
              return { invoice, settlement: undefined };
            }
          })
        );

        setInvoices(invoicesWithSettlements);
      } catch (error) {
        console.error('Failed to load settlements:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="container mx-auto p-6">
      <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Settlement Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx Hash</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confirmed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoices.map(({ invoice, settlement }) => (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">
                  {invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">${invoice.amount?.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{invoice.status}</td>
                <td className="px-6 py-4"><SettlementBadge status={settlement?.status || 'pending'} /></td>
                <td className="px-6 py-4 text-sm text-gray-500 font-mono">{settlement?.tx_hash || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{settlement?.confirmed_at ? new Date(settlement.confirmed_at).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <div className="p-8 text-center text-gray-500">No settled invoices found.</div>}
      </div>
    </div>
  );
}
