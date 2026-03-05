import { render, screen } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders single skeleton by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
  });

  it('applies text variant by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton-text')).toBeInTheDocument();
  });

  it('applies pulse animation by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton-pulse')).toBeInTheDocument();
  });

  it('applies circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />);
    expect(container.querySelector('.skeleton-circular')).toBeInTheDocument();
  });

  it('applies wave animation', () => {
    const { container } = render(<Skeleton animation="wave" />);
    expect(container.querySelector('.skeleton-wave')).toBeInTheDocument();
  });

  it('renders skeleton-group wrapper for count > 1', () => {
    const { container } = render(<Skeleton count={3} />);
    expect(container.querySelector('.skeleton-group')).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  });

  it('sets aria-hidden on skeleton elements', () => {
    render(<Skeleton />);
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom" />);
    expect(container.querySelector('.custom')).toBeInTheDocument();
  });

  it('renders rectangular variant with no border radius', () => {
    const { container } = render(<Skeleton variant="rectangular" />);
    expect(container.querySelector('.skeleton-rectangular')).toBeInTheDocument();
  });

  it('applies none animation', () => {
    const { container } = render(<Skeleton animation="none" />);
    expect(container.querySelector('.skeleton-none')).toBeInTheDocument();
  });
});