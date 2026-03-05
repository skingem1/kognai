import React from 'react';
import { render, screen } from '@testing-library/react';
import { InvoiceTable, InvoiceRow } from '../../components/invoices/invoice-table';

describe('InvoiceTable', () => {
  const mockInvoices: InvoiceRow[] = [
    { id: '1', number: 'INV-001', amount: 100.50, currency: 'USD', status: 'pending', createdAt: '2024-01-15' },
    { id: '2', number: 'INV-002', amount: 250.00, currency: 'USD', status: 'paid', createdAt: '2024-01-16' },
    { id: '3', number: 'INV-003', amount: 75.25, currency: 'USD', status: 'failed', createdAt: '2024-01-17' },
  ];

  it('renders loading state', () => {
    render(<InvoiceTable invoices={[]} isLoading={true} />);
    expect(screen.getByText('Loading invoices...')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<InvoiceTable invoices={[]} />);
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('renders invoice rows', () => {
    render(<InvoiceTable invoices={mockInvoices} />);
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('USD 100.50')).toBeInTheDocument();
  });

  it('applies correct status colors', () => {
    render(<InvoiceTable invoices={mockInvoices} />);
    const pending = screen.getByText('pending');
    const paid = screen.getByText('paid');
    const failed = screen.getByText('failed');
    expect(pending).toHaveClass('text-amber-600');
    expect(paid).toHaveClass('text-emerald-600');
    expect(failed).toHaveClass('text-red-600');
  });

  it('handles empty invoices array', () => {
    render(<InvoiceTable invoices={[]} />);
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });
});
