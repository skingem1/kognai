import { render, screen } from '@testing-library/react';
import { Kbd } from '../Kbd';

describe('Kbd', () => {
  it('renders children', () => { render(<Kbd>Enter</Kbd>); expect(screen.getByText('Enter')).toBeInTheDocument(); });
  it('has kbd base class', () => { const { container } = render(<Kbd>K</Kbd>); expect(container.querySelector('.kbd')).toBeInTheDocument(); });
  it('has default size class', () => { const { container } = render(<Kbd>K</Kbd>); expect(container.querySelector('.kbd-md')).toBeInTheDocument(); });
  it('applies size class', () => { const { container } = render(<Kbd size="sm">K</Kbd>); expect(container.querySelector('.kbd-sm')).toBeInTheDocument(); });
  it('applies lg size class', () => { const { container } = render(<Kbd size="lg">K</Kbd>); expect(container.querySelector('.kbd-lg')).toBeInTheDocument(); });
  it('has role text', () => { render(<Kbd>K</Kbd>); expect(screen.getByRole('text')).toBeInTheDocument(); });
  it('has aria-label', () => { render(<Kbd>K</Kbd>); expect(screen.getByLabelText('Keyboard shortcut')).toBeInTheDocument(); });
  it('applies custom className', () => { const { container } = render(<Kbd className="custom">K</Kbd>); expect(container.querySelector('.custom')).toBeInTheDocument(); });
  it('renders complex children', () => { render(<Kbd><span>Ctrl</span>+<span>C</span></Kbd>); expect(screen.getByText('Ctrl')).toBeInTheDocument(); });
});