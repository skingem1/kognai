import { render, screen } from '@testing-library/react';
import { SettlementBadge } from '../settlement-badge';

describe('SettlementBadge', () => {
  it('renders status text with emerald classes for confirmed', () => {
    render(<SettlementBadge status="confirmed" />);
    expect(screen.getByText('confirmed')).toHaveClass('bg-emerald-100');
  });

  it('applies amber classes for pending status', () => {
    render(<SettlementBadge status="pending" />);
    expect(screen.getByText('pending')).toHaveClass('bg-amber-100');
  });

  it('applies gray classes for unknown status', () => {
    render(<SettlementBadge status="processing" />);
    expect(screen.getByText('processing')).toHaveClass('bg-gray-100');
  });

  it('displays truncated txHash when provided', () => {
    render(<SettlementBadge status="confirmed" txHash="0xabc123def456" />);
    expect(screen.getByText('0xabc1...f456')).toBeInTheDocument();
  });

  it('does not render txHash when null', () => {
    render(<SettlementBadge status="confirmed" txHash={null} />);
    expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
  });

  it('displays formatted date when confirmedAt provided', () => {
    render(<SettlementBadge status="confirmed" confirmedAt="2024-01-15T10:30:00Z" />);
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
  });

  it('does not render date when confirmedAt is null', () => {
    render(<SettlementBadge status="confirmed" confirmedAt={null} />);
    expect(screen.queryByText(/Jan/)).not.toBeInTheDocument();
  });

  it('handles case-insensitive status check', () => {
    render(<SettlementBadge status="Confirmed" />);
    expect(screen.getByText('Confirmed')).toHaveClass('bg-emerald-100');
  });
});