import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from '../toast';

describe('Toast', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders message text', () => {
    render(<Toast message="Test message" type="success" onClose={mockOnClose} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<Toast message="Test" type="info" onClose={mockOnClose} />);
    expect(screen.getByRole('button', { name: /×/ })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<Toast message="Test" type="error" onClose={mockOnClose} />);
    fireEvent.click(screen.getByRole('button', { name: /×/ }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renders with success type', () => {
    render(<Toast message="Success" type="success" onClose={mockOnClose} />);
    const toast = screen.getByText('Success').parentElement;
    expect(toast).toHaveStyle({ backgroundColor: '#16a34a' });
  });

  it('renders with error type', () => {
    render(<Toast message="Error" type="error" onClose={mockOnClose} />);
    const toast = screen.getByText('Error').parentElement;
    expect(toast).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('renders with info type', () => {
    render(<Toast message="Info" type="info" onClose={mockOnClose} />);
    const toast = screen.getByText('Info').parentElement;
    expect(toast).toHaveStyle({ backgroundColor: '#2563eb' });
  });
});