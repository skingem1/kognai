import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvoicesPage from '@/app/invoices/page';
import { fetchInvoices } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  fetchInvoices: jest.fn(),
}));

jest.mock('@/components/invoices/invoice-table', () => ({
  InvoiceTable: ({ invoices, loading }: { invoices: unknown[]; loading: boolean }) => (
    <div data-testid="invoice-table">{loading ? 'loading' : `count:${invoices.length}`}</div>
  ),
}));

describe('InvoicesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading spinner while fetching', () => {
    (fetchInvoices as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<InvoicesPage />);
    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument();
  });

  it('renders invoices after successful fetch', async () => {
    (fetchInvoices as jest.Mock).mockResolvedValue({ invoices: [{ id: '1' }] });
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('invoice-table')).toHaveTextContent('count:1');
    });
  });

  it('handles fetch error gracefully', async () => {
    (fetchInvoices as jest.Mock).mockRejectedValue(new Error('failed'));
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('invoice-table')).toHaveTextContent('count:0');
    });
  });

  it('renders New Invoice link', () => {
    (fetchInvoices as jest.Mock).mockResolvedValue({ invoices: [] });
    render(<InvoicesPage />);
    const link = screen.getByRole('link', { name: /new invoice/i });
    expect(link).toHaveAttribute('href', '/invoices/new');
  });
});
