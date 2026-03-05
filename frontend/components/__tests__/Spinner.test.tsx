import { render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders with role status', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has default aria-label Loading', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('uses custom label', () => {
    render(<Spinner label="Please wait" />);
    expect(screen.getByLabelText('Please wait')).toBeInTheDocument();
  });

  it('has default size md class', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.spinner-md')).toBeInTheDocument();
  });

  it('applies sm size', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.querySelector('.spinner-sm')).toBeInTheDocument();
  });

  it('has default color primary', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.spinner-primary')).toBeInTheDocument();
  });

  it('applies secondary color', () => {
    const { container } = render(<Spinner color="secondary" />);
    expect(container.querySelector('.spinner-secondary')).toBeInTheDocument();
  });

  it('renders three dots', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelectorAll('.spinner-dot')).toHaveLength(3);
  });

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom" />);
    expect(container.querySelector('.custom')).toBeInTheDocument();
  });
});