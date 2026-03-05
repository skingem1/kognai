import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewInvoicePage from '@/app/invoices/new/page';

jest.mock('@/lib/api-client', () => ({
  apiPost: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { apiPost } from '@/lib/api-client';

describe('NewInvoicePage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders form with all fields', () => {
    render(<NewInvoicePage />);
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Currency/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Customer Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Customer Name/)).toBeInTheDocument();
  });

  it('has USD as default currency', () => {
    render(<NewInvoicePage />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('USD');
  });

  it('submits form successfully', async () => {
    (apiPost as jest.Mock).mockResolvedValue({ id: '1' });
    render(<NewInvoicePage />);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Customer Email/), { target: { value: 'test@test.com' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/v1/invoices', expect.any(Object)));
  });

  it('shows error on failed submission', async () => {
    (apiPost as jest.Mock).mockRejectedValue(new Error('Failed'));
    render(<NewInvoicePage />);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Customer Name/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Customer Email/), { target: { value: 'test@test.com' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/Failed to create invoice/)).toBeInTheDocument());
  });
});
