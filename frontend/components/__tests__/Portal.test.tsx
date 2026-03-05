import { render, screen } from '@testing-library/react';
import { Portal } from '../Portal';

describe('Portal', () => {
  it('renders children into document.body by default', () => {
    render(<Portal><span>Portal content</span></Portal>);
    expect(screen.getByText('Portal content')).toBeInTheDocument();
  });

  it('renders into custom container element', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<Portal container={container}><span>Custom</span></Portal>);
    expect(container.textContent).toContain('Custom');
    document.body.removeChild(container);
  });

  it('renders into container by selector', () => {
    const div = document.createElement('div');
    div.id = 'portal-root';
    document.body.appendChild(div);
    render(<Portal container="#portal-root"><span>Selector</span></Portal>);
    expect(div.textContent).toContain('Selector');
    document.body.removeChild(div);
  });

  it('falls back to body for invalid selector', () => {
    render(<Portal container="#nonexistent"><span>Fallback</span></Portal>);
    expect(screen.getByText('Fallback')).toBeInTheDocument();
  });
});