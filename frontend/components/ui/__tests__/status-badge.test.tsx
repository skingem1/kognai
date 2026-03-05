import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../status-badge';

describe('StatusBadge', () => {
  it('renders "Completed" text for status completed', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders "Pending" text for status pending', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders "Failed" text for status failed', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders "Processing" text for status processing', () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('renders as a span element', () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    render(<StatusBadge status="completed" className="custom-class" />);
    const badge = screen.getByText('Completed');
    expect(badge).toHaveClass('custom-class');
  });
});