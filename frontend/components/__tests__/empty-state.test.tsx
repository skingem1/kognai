import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../empty-state';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No data" description="Nothing here" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders action button when both props provided', () => {
    const onAction = jest.fn();
    render(<EmptyState title="No data" description="Nothing here" actionLabel="Add Item" onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('calls onAction when button clicked', () => {
    const onAction = jest.fn();
    render(<EmptyState title="No data" description="Nothing here" actionLabel="Add Item" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render button when actionLabel missing', () => {
    render(<EmptyState title="No data" description="Nothing here" onAction={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render button when onAction missing', () => {
    render(<EmptyState title="No data" description="Nothing here" actionLabel="Add Item" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render button when both missing', () => {
    render(<EmptyState title="No data" description="Nothing here" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});