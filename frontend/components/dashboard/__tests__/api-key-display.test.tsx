import { render, screen, fireEvent } from '@testing-library/react';
import ApiKeyDisplay from '../api-key-display';

const TEST_KEY = 'sk-test-abc123xyz789';

describe('ApiKeyDisplay', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('shows masked key by default with default label', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} />);
    expect(screen.getByText('sk-****...z789')).toBeInTheDocument();
    expect(screen.getByText('API Key')).toBeInTheDocument();
  });

  it('reveals full key when Show is clicked', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} />);
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText(TEST_KEY)).toBeInTheDocument();
  });

  it('masks key again when Hide is clicked', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} />);
    fireEvent.click(screen.getByText('Show'));
    fireEvent.click(screen.getByText('Hide'));
    expect(screen.getByText('sk-****...z789')).toBeInTheDocument();
  });

  it('copies key to clipboard when Copy is clicked', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} />);
    fireEvent.click(screen.getByText('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEST_KEY);
  });

  it('displays custom label when provided', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} label="My API Key" />);
    expect(screen.getByText('My API Key')).toBeInTheDocument();
  });

  it('shows Revoke button and calls onRevoke when clicked', () => {
    const onRevoke = jest.fn();
    render(<ApiKeyDisplay apiKey={TEST_KEY} onRevoke={onRevoke} />);
    expect(screen.getByText('Revoke')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Revoke'));
    expect(onRevoke).toHaveBeenCalled();
  });

  it('does not show Revoke button when onRevoke is not provided', () => {
    render(<ApiKeyDisplay apiKey={TEST_KEY} />);
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
  });
});