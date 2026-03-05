import { render, screen, fireEvent } from '@testing-library/react';
import { Tag } from '../Tag';

describe('Tag', () => {
  it('renders label text', () => {
    render(<Tag label="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('has default variant class', () => {
    render(<Tag label="T" />);
    expect(screen.getByText('T')).toHaveClass('tag-default');
  });

  it('applies variant class', () => {
    render(<Tag label="T" variant="success" />);
    expect(screen.getByText('T')).toHaveClass('tag-success');
  });

  it('applies size class', () => {
    render(<Tag label="T" size="sm" />);
    expect(screen.getByText('T')).toHaveClass('tag-sm');
  });

  it('has role status', () => {
    render(<Tag label="T" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show remove button by default', () => {
    render(<Tag label="T" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows remove button when removable', () => {
    render(<Tag label="T" removable />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onRemove when remove clicked', () => {
    const fn = jest.fn();
    render(<Tag label="T" removable onRemove={fn} />);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('remove button has aria-label', () => {
    render(<Tag label="Hello" removable />);
    expect(screen.getByLabelText('Remove Hello')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Tag label="T" className="custom" />);
    expect(screen.getByText('T')).toHaveClass('custom');
  });
});