import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Tooltip} from '../Tooltip';

jest.useFakeTimers();

describe('Tooltip', () => {
  afterEach(() => jest.clearAllTimers());

  it('renders children', () => {
    render(<Tooltip content="tip"><button>Hover me</button></Tooltip>);
    expect(screen.getByText('Hover me')).toBeDefined();
  });

  it('tooltip hidden by default', () => {
    render(<Tooltip content="tip"><span>X</span></Tooltip>);
    expect(screen.queryByText('tip')).toBeNull();
  });

  it('shows tooltip on hover after delay', () => {
    render(<Tooltip content="Hello" delay={100}><span>X</span></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('X').parentElement!);
    act(() => jest.advanceTimersByTime(100));
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('hides tooltip on mouse leave', () => {
    render(<Tooltip content="Hello" delay={100}><span>X</span></Tooltip>);
    const wrapper = screen.getByText('X').parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => jest.advanceTimersByTime(100));
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('applies top position by default', () => {
    render(<Tooltip content="Hello" delay={100}><span>X</span></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('X').parentElement!);
    act(() => jest.advanceTimersByTime(100));
    const tip = screen.getByText('Hello');
    expect(tip.className).toContain('bottom-full');
  });

  it('applies bottom position', () => {
    render(<Tooltip content="Hello" position="bottom" delay={100}><span>X</span></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('X').parentElement!);
    act(() => jest.advanceTimersByTime(100));
    const tip = screen.getByText('Hello');
    expect(tip.className).toContain('top-full');
  });

  it('applies custom className', () => {
    render(<Tooltip content="Hello" className="custom" delay={100}><span>X</span></Tooltip>);
    fireEvent.mouseEnter(screen.getByText('X').parentElement!);
    act(() => jest.advanceTimersByTime(100));
    const tip = screen.getByText('Hello');
    expect(tip.className).toContain('custom');
  });

  it('clears timeout on fast mouse leave', () => {
    render(<Tooltip content="Hello" delay={100}><span>X</span></Tooltip>);
    const wrapper = screen.getByText('X').parentElement!;
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);
    act(() => jest.advanceTimersByTime(100));
    expect(screen.queryByText('Hello')).toBeNull();
  });
});