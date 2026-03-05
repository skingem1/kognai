import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../confirm-dialog';

describe('ConfirmDialog', () => {
  const props = { open: true, onClose: jest.fn(), onConfirm: jest.fn(), title: 'Title', message: 'Message' };

  beforeEach(() => { jest.clearAllMocks(); document.body.style.overflow = ''; });

  it('renders nothing when open=false', () => {
    const { queryByRole } = render(<ConfirmDialog {...props} open={false} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders dialog with title, message and correct attributes when open=true', () => {
    render(<ConfirmDialog {...props} open={true} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('calls onClose on cancel click', () => {
    render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm then onClose on confirm click', () => {
    render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders custom confirmLabel and cancelLabel', () => {
    render(<ConfirmDialog {...props} confirmLabel="Yes" cancelLabel="No" />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('calls onClose on escape key', () => {
    render(<ConfirmDialog {...props} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on overlay click but not on inner content click', () => {
    const { container } = render(<ConfirmDialog {...props} />);
    const overlay = container.firstChild as HTMLElement;
    const dialog = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    props.onClose.mockClear();
    fireEvent.click(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('sets body overflow to hidden on open and unsets on cleanup', () => {
    const { unmount } = render(<ConfirmDialog {...props} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });
});