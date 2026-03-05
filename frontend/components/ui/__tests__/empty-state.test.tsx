import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../empty-state';

describe('EmptyState', () => {
  it('renders title only when no other props provided', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.queryByText(/Try adding/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No items" description="Try adding one" />);
    expect(screen.getByText('Try adding one')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="No items" />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('renders button when actionLabel and onAction provided', () => {
    const onAction = jest.fn();
    render(<EmptyState title="No items" actionLabel="Add Item" onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('calls onAction when button clicked', () => {
    const onAction = jest.fn();
    render(<EmptyState title="No items" actionLabel="Add Item" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No items" icon={<span>Icon</span>} />);
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });
});