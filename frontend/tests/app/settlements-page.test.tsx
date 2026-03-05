import { render, screen, waitFor } from '@testing-library/react';
import SettlementsPage from '@/app/settlements/page';
import { fetchInvoices, fetchSettlement } from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockInvoices = [
  { id: '1', invoice_number: 'INV-001', amount: 1000, status: 'settled' },
  { id: '2', invoice_number: 'INV-002', amount: 2000, status: 'completed' },
  { id: '3', invoice_number: 'INV-003', amount: 3000, status: 'pending' },
];

const mockSettlements: Record<string, { status: string; tx_hash?: string; confirmed_at?: string }> = {
  '1': { status: 'confirmed', tx_hash: '0x123', confirmed_at: '2024-01-01' },
  '2': { status: 'pending', tx_hash: '0x456' },
};

describe('SettlementsPage', () => {
  beforeEach(() => {
    (fetchInvoices as jest.Mock).mockResolvedValue(mockInvoices);
    (fetchSettlement as jest.Mock).mockImplementation((id: string) => 
      Promise.resolve(mockSettlements[id] || null)
    );
  });

  it('shows loading state initially', () => {
    render(<SettlementsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('filters to only settled/completed invoices', async () => {
    render(<SettlementsPage />);
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
      expect(screen.getByText('INV-002')).toBeInTheDocument();
    });
    expect(screen.queryByText('INV-003')).not.toBeInTheDocument();
  });

  it('fetches settlement for qualifying invoices', async () => {
    render(<SettlementsPage />);
    await waitFor(() => expect(fetchSettlement).toHaveBeenCalledTimes(2));
  });

  it('displays settlement data in table', async () => {
    render(<SettlementsPage />);
    await waitFor(() => {
      expect(screen.getByText('0x123')).toBeInTheDocument();
    });
  });

  it('handles missing settlement gracefully', async () => {
    (fetchSettlement as jest.Mock).mockResolvedValue(null);
    render(<SettlementsPage />);
    await waitFor(() => expect(screen.getByText('INV-001')).toBeInTheDocument());
  });
});
