import { render, screen } from '@testing-library/react';
import { InvoiceTable } from '../invoice-table';

const sampleInvoice = {
  id: 'inv-1',
  number: 'INV-001',
  amount: 50,
  currency: 'USD',
  status: 'pending',
  createdAt: '2024-01-15T10:00:00Z',
};

const paidInvoice = { ...sampleInvoice, id: 'inv-2', number: 'INV-002', status: 'paid' as const };
const failedInvoice = { ...sampleInvoice, id: 'inv-3', number: 'INV-003', status: 'failed' as const };
const unknownInvoice = { ...sampleInvoice, id: 'inv-4', number: 'INV-004', status: 'unknown' as const };

describe('InvoiceTable', () => {
  it('renders loading state when isLoading is true', () => {
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

  it('renders invoice number in row', () => {
    render(<InvoiceTable invoices={[sampleInvoice]} />);
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });

  it('renders formatted amount', () => {
    render(<InvoiceTable invoices={[sampleInvoice]} />);
    expect(screen.getByText('USD 50.00')).toBeInTheDocument();
  });

  it('renders pending status with amber color', () => {
    render(<InvoiceTable invoices={[sampleInvoice]} />);
    const statusEl = screen.getByText('pending');
    expect(statusEl).toHaveClass('text-amber-600');
  });

  it('renders paid status with emerald color', () => {
    render(<InvoiceTable invoices={[paidInvoice]} />);
    const statusEl = screen.getByText('paid');
    expect(statusEl).toHaveClass('text-emerald-600');
  });

  it('renders failed status with red color', () => {
    render(<InvoiceTable invoices={[failedInvoice]} />);
    const statusEl = screen.getByText('failed');
    expect(statusEl).toHaveClass('text-red-600');
  });

  it('renders unknown status with slate color', () => {
    render(<InvoiceTable invoices={[unknownInvoice]} />);
    const statusEl = screen.getByText('unknown');
    expect(statusEl).toHaveClass('text-slate-600');
  });

  it('renders formatted date', () => {
    render(<InvoiceTable invoices={[sampleInvoice]} />);
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
  });

  it('renders multiple invoice rows', () => {
    render(<InvoiceTable invoices={[sampleInvoice, paidInvoice, failedInvoice]} />);
    const rows = screen.getAllByText(/^(INV-001|INV-002|INV-003)$/);
    expect(rows).toHaveLength(3);
  });
});