import { renderHook, act } from '@testing-library/react';
import { useClipboard } from '../use-clipboard';

describe('useClipboard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => jest.useRealTimers());

  it('initial state: copied false, error null', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('copy sets copied to true and calls writeText', async () => {
    const { result } = renderHook(() => useClipboard());
    const writeText = navigator.clipboard.writeText as jest.Mock;
    await act(async () => { await result.current.copy('hello'); });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);
  });

  it('copied resets after default delay', async () => {
    const { result } = renderHook(() => useClipboard());
    await act(async () => { await result.current.copy('test'); });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.copied).toBe(false);
  });

  it('uses custom delay', async () => {
    const { result } = renderHook(() => useClipboard(1000));
    await act(async () => { await result.current.copy('test'); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.copied).toBe(true);
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.copied).toBe(false);
  });

  it('handles error and clears on success', async () => {
    const { result } = renderHook(() => useClipboard());
    const writeText = navigator.clipboard.writeText as jest.Mock;
    writeText.mockRejectedValueOnce(new Error('Denied'));
    await act(async () => { await result.current.copy('text'); });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.copied).toBe(false);
    writeText.mockResolvedValueOnce(undefined);
    await act(async () => { await result.current.copy('text2'); });
    expect(result.current.error).toBeNull();
  });
});