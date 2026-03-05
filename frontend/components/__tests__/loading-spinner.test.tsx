import { render, screen } from '@testing-library/react';
import { LoadingSpinner, PageLoader } from '../loading-spinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('has default size of 32', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('renders with custom size', () => {
    const { container } = render(<LoadingSpinner size={64} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
  });

  it('renders with custom color', () => {
    const { container } = render(<LoadingSpinner color="red" />);
    const circle = container.querySelector('circle') as SVGElement;
    expect(circle.getAttribute('stroke')).toBe('red');
  });
});

describe('PageLoader', () => {
  it('renders LoadingSpinner with size 48', () => {
    const { container } = render(<PageLoader />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute('width')).toBe('48');
  });
});