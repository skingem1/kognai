import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../tooltip';

describe('Tooltip', () => {
  it('does not render content initially', () => {
    render(<Tooltip content="Tooltip text"><button>Hover me</button></Tooltip>);
    expect(screen.queryByText('Tooltip text')).toBeNull();
  });

  it('shows content on mouse enter', () => {
    render(<Tooltip content="Tooltip text"><button>Hover me</button></Tooltip>);
    const span = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(span);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides content on mouse leave', () => {
    render(<Tooltip content="Tooltip text"><button>Hover me</button></Tooltip>);
    const span = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(span);
    fireEvent.mouseLeave(span);
    expect(screen.queryByText('Tooltip text')).toBeNull();
  });

  it('applies mt-2 class for position bottom', () => {
    render(<Tooltip content="Tooltip text" position="bottom"><button>Hover me</button></Tooltip>);
    const span = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(span);
    expect(screen.getByText('Tooltip text')).toHaveClass('mt-2');
  });

  it('applies mb-2 class for default position top', () => {
    render(<Tooltip content="Tooltip text"><button>Hover me</button></Tooltip>);
    const span = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(span);
    expect(screen.getByText('Tooltip text')).toHaveClass('mb-2');
  });
});