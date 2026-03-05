import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoiceDetailPage from '@/app/invoices/[id]/page';
import { fetchInvoiceById } from '@/lib/api-client';
import { Invoice } from '@/types';

jest.mock('@/lib/api-client');
jest.mock('@/components/invoices/invoice-detail', () => ({
  InvoiceDetail: ({ invoice }: { invoice: Invoice }) => (
    <div data-testid="invoice-detail">Invoice #{invoice.invoiceNumber}</div>
  ),
}));

const mockInvoice: Invoice = {
  id: '1',
  invoiceNumber: 'INV-001',
  amount: 1000,
  status: 'pending',
  customerName: 'Test Customer',
  createdAt: new Date().toISOString(),
};

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading spinner initially', async () => {
    (fetchInvoiceById as jest.Mock).mockImplementation(
      () => new Promise(() => {})
    );
    render(<InvoiceDetailPage params={{ id: '1' }} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders invoice detail when invoice is found', async () => {
    (fetchInvoiceById as jest.Mock).mockResolvedValue(mockInvoice);
    render(<InvoiceDetailPage params={{ id: '1' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('invoice-detail')).toBeInTheDocument();
    });
  });

  it('shows "Invoice not found" when invoice is null', async () => {
    (fetchInvoiceById as jest.Mock).mockResolvedValue(null);
    render(<InvoiceDetailPage params={{ id: '999' }} />);
    await waitFor(() => {
      expect(screen.getByText('Invoice not found')).toBeInTheDocument();
    });
  });

  it('renders back link to invoices page', async () => {
    (fetchInvoiceById as jest.Mock).mockResolvedValue(mockInvoice);
    render(<InvoiceDetailPage params={{ id: '1' }} />);
    const backLink = await screen.findByText('Back to Invoices');
    expect(backLink).toHaveAttribute('href', '/invoices');
  });
});
