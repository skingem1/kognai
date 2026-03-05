import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../loading-spinner';

describe('LoadingSpinner', () => {
  it('renders with role=status', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-label Loading', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });

  it('applies default md size classes (h-8 w-8)', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveClass('h-8 w-8');
  });

  it('applies sm size classes (h-4 w-4)', () => {
    render(<LoadingSpinner size="sm" />);
    expect(screen.getByRole('status')).toHaveClass('h-4 w-4');
  });

  it('applies lg size classes (h-12 w-12)', () => {
    render(<LoadingSpinner size="lg" />);
    expect(screen.getByRole('status')).toHaveClass('h-12 w-12');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    expect(screen.getByRole('status')).toHaveClass('custom-class');
  });
});