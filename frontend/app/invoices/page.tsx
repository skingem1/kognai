'use client';

import { useState, useEffect } from 'react';
import { fetchInvoices, InvoiceListResponse, InvoiceListItem } from '@/lib/api-client';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceListItem | null>(null);

  useEffect(() => {
    async function loadInvoices() {
      try {
        const data = await fetchInvoices();
        setInvoices(data.invoices);
      } catch (error) {
        console.error('Failed to fetch invoices:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInvoices();
  }, []);

  const downloadInvoice = (invoice: InvoiceListItem) => {
    const html = generateInvoiceHTML(invoice);
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const generateInvoiceHTML = (inv: InvoiceListItem) => {
    const statusColor = inv.status === 'completed' || inv.status === 'settled'
      ? '#16a34a' : inv.status === 'pending' ? '#ca8a04' : '#dc2626';
    const subtotal = inv.subtotal || inv.amount;
    const taxAmount = inv.taxAmount || 0;
    const total = inv.total || inv.amount;
    const sellerName = inv.sellerName || 'Seller';
    const description = inv.serviceDescription || 'AI Agent Services';
    return `<!DOCTYPE html>
<html><head><title>Invoice ${inv.invoiceNumber}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #0A2540; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
  .brand { font-size: 28px; font-weight: 700; color: #0A2540; }
  .brand-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 32px; color: #0A2540; margin: 0; }
  .invoice-number { font-size: 14px; color: #666; margin-top: 4px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: white; background: ${statusColor}; }
  .details { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 48px; }
  .detail-group h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .detail-group p { font-size: 14px; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { text-align: left; padding: 12px 16px; background: #f8f9fa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 2px solid #e2e8f0; }
  td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .subtotal-row td { padding: 8px 16px; font-size: 14px; border-bottom: none; }
  .tax-row td { padding: 8px 16px; font-size: 14px; color: #666; border-bottom: 1px solid #e2e8f0; }
  .total-row { background: #f8f9fa; font-weight: 700; font-size: 18px; }
  .footer { text-align: center; margin-top: 64px; padding-top: 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #999; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <div><div class="brand">${sellerName}</div></div>
  <div class="invoice-title"><h1>INVOICE</h1><div class="invoice-number">${inv.invoiceNumber}</div><div style="margin-top:8px"><span class="status">${inv.status}</span></div></div>
</div>
<div class="details">
  <div class="detail-group"><h3>Bill To</h3><p>${inv.customerName || 'Customer'}</p><p>${inv.customerEmail || ''}</p></div>
  <div class="detail-group" style="text-align:right"><h3>Invoice Date</h3><p>${new Date(inv.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>${inv.taxCountry ? `<h3 style="margin-top:16px">Tax Jurisdiction</h3><p>${inv.taxCountry}</p>` : ''}</div>
</div>
<table><thead><tr><th>Description</th><th>Currency</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
<tr><td>${description}</td><td>${inv.currency}</td><td style="text-align:right">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
<tr class="subtotal-row"><td colspan="2" style="text-align:right">Subtotal</td><td style="text-align:right">${inv.currency} ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
${taxAmount > 0 ? `<tr class="tax-row"><td colspan="2" style="text-align:right">${inv.taxType || 'VAT'} (${inv.taxRate}%)</td><td style="text-align:right">${inv.currency} ${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>` : ''}
<tr class="total-row"><td colspan="2">Total</td><td style="text-align:right">${inv.currency} ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
</tbody></table>
<div class="footer">Powered by Invoica &mdash; x402 Protocol &bull; invoica.ai</div>
</body></html>`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#635BFF]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Invoices</h1>
      {invoices.length === 0 ? (
        <div className="text-center py-20 text-slate-500">No invoices found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Seller</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Created</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{invoice.sellerName || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {invoice.currency} {(invoice.total || invoice.amount).toFixed(2)}
                    {(invoice.taxAmount || 0) > 0 && (
                      <span className="text-xs text-slate-400 ml-1">(incl. tax)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      invoice.status === 'completed' || invoice.status === 'settled'
                        ? 'bg-green-100 text-green-700'
                        : invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                        : invoice.status === 'overdue' ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setPreviewInvoice(invoice)} className="text-xs font-medium text-[#635BFF] hover:text-[#635BFF]/80 mr-3">Preview</button>
                    <button onClick={() => downloadInvoice(invoice)} className="text-xs font-medium text-slate-600 hover:text-slate-900">Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Modal */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-8">
              {/* Invoice Preview Header — Seller name on top-right */}
              <div className="flex justify-between items-start mb-10">
                <div>
                  <div className="text-2xl font-bold text-[#0A2540]">{previewInvoice.sellerName || 'Seller'}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#0A2540]">INVOICE</div>
                  <div className="text-sm text-slate-500 mt-1">{previewInvoice.invoiceNumber}</div>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold text-white ${
                    previewInvoice.status === 'completed' || previewInvoice.status === 'settled'
                      ? 'bg-green-500' : previewInvoice.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}>
                    {previewInvoice.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-8 mb-10">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Bill To</div>
                  <div className="text-sm font-medium">{previewInvoice.customerName || 'Customer'}</div>
                  <div className="text-sm text-slate-500">{previewInvoice.customerEmail || ''}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Date</div>
                  <div className="text-sm">{new Date(previewInvoice.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  {previewInvoice.taxCountry && (
                    <>
                      <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 mt-4">Tax Jurisdiction</div>
                      <div className="text-sm">{previewInvoice.taxCountry}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Line Items with Tax */}
              <table className="w-full text-sm mb-8">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 text-xs uppercase tracking-wider text-slate-400">Description</th>
                    <th className="text-right py-3 text-xs uppercase tracking-wider text-slate-400">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-4">{previewInvoice.serviceDescription || 'AI Agent Services'}</td>
                    <td className="py-4 text-right">{previewInvoice.currency} {(previewInvoice.subtotal || previewInvoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 text-right text-slate-500">Subtotal</td>
                    <td className="py-2 text-right text-slate-500">{previewInvoice.currency} {(previewInvoice.subtotal || previewInvoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  {(previewInvoice.taxAmount || 0) > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="py-2 text-right text-slate-500">{previewInvoice.taxType || 'VAT'} ({previewInvoice.taxRate}%)</td>
                      <td className="py-2 text-right text-slate-500">{previewInvoice.currency} {(previewInvoice.taxAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold text-lg">
                    <td className="py-4 px-2">Total</td>
                    <td className="py-4 px-2 text-right">{previewInvoice.currency} {(previewInvoice.total || previewInvoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>

              {/* Footer */}
              <div className="text-center text-xs text-slate-400 mb-6">Powered by Invoica &mdash; x402 Protocol</div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setPreviewInvoice(null)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50">Close</button>
                <button onClick={() => downloadInvoice(previewInvoice)} className="px-4 py-2 text-sm font-semibold text-white bg-[#635BFF] rounded-md hover:bg-[#635BFF]/90">Download PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
