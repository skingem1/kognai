import { render, screen } from '@testing-library/react';
import { InvoiceDetail } from '../invoice-detail';

const sampleInvoice = {
  id: 'inv-1',
  number: 'INV-001',
  amount: 150.50,
  currency: 'USD',
  status: 'pending',
  createdAt: '2024-01-15T10:00:00Z',
  paidAt: null,
  metadata: { customer: 'acme' },
};

describe('InvoiceDetail', () => {
  it('shows loading message when isLoading is true', () => {
    render(<InvoiceDetail invoice={null} isLoading={true} />);
    expect(screen.getByText('Loading invoice details...')).toBeInTheDocument();
  });

  it('shows Invoice not found when invoice is null', () => {
    render(<InvoiceDetail invoice={null} />);
    expect(screen.getByText('Invoice not found')).toBeInTheDocument();
  });

  it('renders invoice number as heading and formats amount as USD currency', () => {
    render(<InvoiceDetail invoice={sampleInvoice} />);
    expect(screen.getByRole('heading', { name: 'INV-001' })).toBeInTheDocument();
    expect(screen.getByText('$150.50')).toBeInTheDocument();
  });

  it('renders status badge with correct color classes for all statuses', () => {
    const { rerender } = render(<InvoiceDetail invoice={{ ...sampleInvoice, status: 'pending' }} />);
    let badge = screen.getByText('pending');
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');

    rerender(<InvoiceDetail invoice={{ ...sampleInvoice, status: 'completed' }} />);
    badge = screen.getByText('completed');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');

    rerender(<InvoiceDetail invoice={{ ...sampleInvoice, status: 'failed' }} />);
    badge = screen.getByText('failed');
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('renders created date in en-US short month format and paidAt as Not yet when null', () => {
    render(<InvoiceDetail invoice={sampleInvoice} />);
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('renders metadata as JSON when present and hides section when empty', () => {
    const { container } = render(<InvoiceDetail invoice={sampleInvoice} />);
    expect(container.querySelector('pre')).toHaveTextContent(/"customer":\s*"acme"/);

    render(<InvoiceDetail invoice={{ ...sampleInvoice, metadata: {} }} />);
    expect(screen.queryByText('Metadata')).not.toBeInTheDocument();
  });
});