import {render, screen} from '@testing-library/react';
import React from 'react';
import {Badge} from '../Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('applies default variant', () => {
    render(<Badge>Test</Badge>);
    const el = screen.getByText('Test');
    expect(el.className).toContain('bg-gray-100');
  });

  it('applies success variant', () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText('OK').className).toContain('bg-green-100');
  });

  it('applies warning variant', () => {
    render(<Badge variant="warning">Warn</Badge>);
    expect(screen.getByText('Warn').className).toContain('bg-yellow-100');
  });

  it('applies error variant', () => {
    render(<Badge variant="error">Err</Badge>);
    expect(screen.getByText('Err').className).toContain('bg-red-100');
  });

  it('applies info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info').className).toContain('bg-blue-100');
  });

  it('applies small size', () => {
    render(<Badge size="sm">S</Badge>);
    expect(screen.getByText('S').className).toContain('text-xs');
  });

  it('applies large size', () => {
    render(<Badge size="lg">L</Badge>);
    expect(screen.getByText('L').className).toContain('text-base');
  });

  it('rounded true by default', () => {
    render(<Badge>R</Badge>);
    expect(screen.getByText('R').className).toContain('rounded-full');
  });

  it('rounded false', () => {
    render(<Badge rounded={false}>NR</Badge>);
    const el = screen.getByText('NR');
    expect(el.className).toContain('rounded');
    expect(el.className).not.toContain('rounded-full');
  });

  it('applies custom className', () => {
    render(<Badge className="custom">C</Badge>);
    expect(screen.getByText('C').className).toContain('custom');
  });
});