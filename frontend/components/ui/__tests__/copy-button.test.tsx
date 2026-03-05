import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import CopyButton from '../copy-button';

describe('CopyButton', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders default label "Copy"', () => {
    render(<CopyButton text="test" />);
    expect(screen.getByRole('button')).toHaveTextContent('Copy');
  });

  it('renders custom label when provided', () => {
    render(<CopyButton text="test" label="Copy Code" />);
    expect(screen.getByRole('button')).toHaveTextContent('Copy Code');
  });

  it('calls clipboard.writeText with correct text on click', async () => {
    render(<CopyButton text="hello world" />);
    fireEvent.click(screen.getByRole('button'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('shows "Copied!" after click', async () => {
    render(<CopyButton text="test" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Copied!');
    });
  });

  it('applies custom className', () => {
    render(<CopyButton text="test" className="custom-class" />);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});