import { renderHook, act } from '@testing-library/react';
import { useToggle } from '../use-toggle';

describe('useToggle', () => {
  it('initializes to false by default', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current.isOn).toBe(false);
  });

  it('initializes to provided value', () => {
    const { result } = renderHook(() => useToggle(true));
    expect(result.current.isOn).toBe(true);
  });

  it('toggle flips from false to true', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => { result.current.toggle(); });
    expect(result.current.isOn).toBe(true);
  });

  it('toggle flips from true to false', () => {
    const { result } = renderHook(() => useToggle(true));
    act(() => { result.current.toggle(); });
    expect(result.current.isOn).toBe(false);
  });

  it('double toggle returns to original', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => { result.current.toggle(); });
    act(() => { result.current.toggle(); });
    expect(result.current.isOn).toBe(false);
  });

  it('setOn sets value to true', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => { result.current.setOn(); });
    expect(result.current.isOn).toBe(true);
  });

  it('setOn when already true stays true', () => {
    const { result } = renderHook(() => useToggle(true));
    act(() => { result.current.setOn(); });
    expect(result.current.isOn).toBe(true);
  });

  it('setOff sets value to false', () => {
    const { result } = renderHook(() => useToggle(true));
    act(() => { result.current.setOff(); });
    expect(result.current.isOn).toBe(false);
  });

  it('setOff when already false stays false', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => { result.current.setOff(); });
    expect(result.current.isOn).toBe(false);
  });

  it('setValue(true) sets to true', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => { result.current.setValue(true); });
    expect(result.current.isOn).toBe(true);
  });

  it('setValue(false) sets to false', () => {
    const { result } = renderHook(() => useToggle(true));
    act(() => { result.current.setValue(false); });
    expect(result.current.isOn).toBe(false);
  });
});