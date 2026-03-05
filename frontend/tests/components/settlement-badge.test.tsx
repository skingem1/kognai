import React from 'react';
import { render, screen } from '@testing-library/react';
import { SettlementBadge } from '@/components/settlements/settlement-badge';

describe('SettlementBadge', () => {
  it('renders confirmed status with green styling', () => {
    render(<SettlementBadge status="confirmed" txHash="0x1234567890abcdef1234567890abcdef12345678" confirmedAt="2024-01-15" />);
    expect(screen.getByText('confirmed')).toHaveClass('bg-emerald-100', 'text-emerald-700');
  });

  it('renders pending status with amber styling', () => {
    render(<SettlementBadge status="pending" />);
    expect(screen.getByText('pending')).toHaveClass('bg-amber-100', 'text-amber-700');
  });

  it('renders other status with gray styling', () => {
    render(<SettlementBadge status="failed" />);
    expect(screen.getByText('failed')).toHaveClass('bg-gray-100', 'text-gray-700');
  });

  it('displays truncated txHash when provided', () => {
    render(<SettlementBadge status="confirmed" txHash="0x1234567890abcdef1234567890abcdef12345678" />);
    expect(screen.getByText('0x1234...5678')).toHaveClass('text-gray-500', 'text-xs');
  });

  it('displays formatted date when confirmedAt is provided', () => {
    render(<SettlementBadge status="confirmed" confirmedAt="2024-01-15" />);
    expect(screen.getByText('1/15/2024')).toHaveClass('text-gray-400', 'text-xs');
  });

  it('hides optional fields when not provided', () => {
    render(<SettlementBadge status="confirmed" />);
    expect(screen.queryByText(/0x/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+\/\d+/)).not.toBeInTheDocument();
  });
});
