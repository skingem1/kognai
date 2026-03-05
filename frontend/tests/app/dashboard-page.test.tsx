import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/page';
import { fetchDashboardStats, fetchRecentActivity } from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockStats = { totalInvoices: 150, pending: 25, settled: 120, revenue: 50000 };
const mockActivity = [
  { id: '1', title: 'Invoice #123', description: 'Payment received', timestamp: '2024-01-15T10:00:00Z', status: 'success' },
  { id: '2', title: 'Invoice #124', description: 'Pending review', timestamp: '2024-01-15T11:00:00Z', status: 'pending' },
];

describe('DashboardPage', () => {
  it('shows loading spinner initially', () => {
    (fetchDashboardStats as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders stats and activity after loading', async () => {
    (fetchDashboardStats as jest.Mock).mockResolvedValue(mockStats);
    (fetchRecentActivity as jest.Mock).mockResolvedValue(mockActivity);
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Total Invoices')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });
    expect(screen.getByText('Invoice #123')).toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    (fetchDashboardStats as jest.Mock).mockRejectedValue(new Error('Failed'));
    (fetchRecentActivity as jest.Mock).mockResolvedValue([]);
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.queryByText('Total Invoices')).not.toBeInTheDocument();
    });
  });
});
