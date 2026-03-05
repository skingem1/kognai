import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders with default props', () => {
    render(<ProgressBar value={50} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays correct percentage', () => {
    render(<ProgressBar value={75} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('clamps value to 100', () => {
    render(<ProgressBar value={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps value to 0', () => {
    render(<ProgressBar value={-20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows label when showLabel is true', () => {
    render(<ProgressBar value={60} showLabel />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('hides label by default', () => {
    render(<ProgressBar value={60} />);
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
  });

  it('applies size class', () => {
    render(<ProgressBar value={50} size="lg" />);
    expect(document.querySelector('.progress-bar-lg')).toBeInTheDocument();
  });

  it('applies color class', () => {
    render(<ProgressBar value={50} color="green" />);
    expect(document.querySelector('.progress-bar-green')).toBeInTheDocument();
  });

  it('applies animated class when animated', () => {
    render(<ProgressBar value={50} animated />);
    expect(document.querySelector('.progress-bar-animated')).toBeInTheDocument();
  });

  it('calculates percentage with custom max', () => {
    render(<ProgressBar value={25} max={50} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('applies custom className', () => {
    render(<ProgressBar value={50} className="custom" />);
    expect(document.querySelector('.custom')).toBeInTheDocument();
  });
});