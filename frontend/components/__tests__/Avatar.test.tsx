import {render, screen} from '@testing-library/react';
import React from 'react';
import {Avatar} from '../Avatar';

describe('Avatar', () => {
  it('renders image when src provided', () => {
    render(<Avatar src="https://example.com/photo.jpg" alt="John" />);
    const img = screen.getByRole('img');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });

  it('renders initials when name provided', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeDefined();
  });

  it('renders single initial', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('renders fallback when no src or name', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeDefined();
  });

  it('applies sm size', () => {
    render(<Avatar name="A" size="sm" />);
    const el = screen.getByText('A');
    expect(el.className).toContain('w-8');
  });

  it('applies lg size', () => {
    render(<Avatar name="A" size="lg" />);
    expect(screen.getByText('A').className).toContain('w-12');
  });

  it('applies xl size', () => {
    render(<Avatar name="A" size="xl" />);
    expect(screen.getByText('A').className).toContain('w-16');
  });

  it('applies custom className', () => {
    render(<Avatar name="A" className="custom" />);
    expect(screen.getByText('A').className).toContain('custom');
  });

  it('default size is md', () => {
    render(<Avatar name="A" />);
    expect(screen.getByText('A').className).toContain('w-10');
  });

  it('image has rounded class', () => {
    render(<Avatar src="test.jpg" />);
    expect(screen.getByRole('img').className).toContain('rounded-full');
  });
});