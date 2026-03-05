import React from 'react';
import { render, screen } from '@testing-library/react';
import { InvoiceDetail } from '../../../components/invoices/invoice-detail';

describe('InvoiceDetail', () => {
  const mockInvoice = {
    id: 'inv-123',
    number: 'INV-2024-001',
    amount: 150.00,
    currency: 'USD',
    status: 'pending',
    createdAt: '2024-01-15T10:00:00Z',
    paidAt: null,
    metadata: { customerId: 'cust-456' },
  };

  it('shows loading state', () => {
    render(<InvoiceDetail invoice={null} isLoading={true} />);
    expect(screen.getByText('Loading invoice details...')).toBeInTheDocument();
  });

  it('shows not found when invoice is null', () => {
    render(<InvoiceDetail invoice={null} isLoading={false} />);
    expect(screen.getByText('Invoice not found')).toBeInTheDocument();
  });

  it('renders invoice details with metadata', () => {
    render(<InvoiceDetail invoice={mockInvoice} isLoading={false} />);
    expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText(/customerId/)).toBeInTheDocument();
  });

  it('renders without metadata section', () => {
    const noMeta = { ...mockInvoice, metadata: {} };
    render(<InvoiceDetail invoice={noMeta} isLoading={false} />);
    expect(screen.queryByText(/customerId/)).not.toBeInTheDocument();
  });

  it('shows "Not yet" when paidAt is null', () => {
    render(<InvoiceDetail invoice={mockInvoice} isLoading={false} />);
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('displays paid date when present', () => {
    const paid = { ...mockInvoice, paidAt: '2024-01-20T10:00:00Z' };
    render(<InvoiceDetail invoice={paid} isLoading={false} />);
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
  });
});
