import { render, screen, fireEvent } from '@testing-library/react';
import { PageHeader } from '../page-header';

describe('PageHeader', () => {
  it('renders title as h1', () => {
    render(<PageHeader title="My Page" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Page');
  });

  it('renders description when provided', () => {
    render(<PageHeader title="My Page" description="Some description" />);
    expect(screen.getByText('Some description')).toBeInTheDocument();
  });

  it('does NOT render description when not provided', () => {
    render(<PageHeader title="My Page" />);
    expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
  });

  it('renders action button when action provided', () => {
    render(<PageHeader title="My Page" action={{ label: 'Add Item', onClick: jest.fn() }} />);
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('clicking action button calls onClick', () => {
    const onClick = jest.fn();
    render(<PageHeader title="My Page" action={{ label: 'Add Item', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT render button when action not provided', () => {
    render(<PageHeader title="My Page" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});