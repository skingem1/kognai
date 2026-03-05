import { renderHook, act } from '@testing-library/react'
import { useIdle } from '../use-idle'

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

describe('useIdle', () => {
  it('starts as not idle', () => {
    const { result } = renderHook(() => useIdle(1000))
    expect(result.current).toBe(false)
  })

  it('becomes idle after timeout', () => {
    const { result } = renderHook(() => useIdle(1000))
    act(() => { jest.advanceTimersByTime(1001) })
    expect(result.current).toBe(true)
  })

  it('resets on user activity', () => {
    const { result } = renderHook(() => useIdle(1000))
    act(() => { jest.advanceTimersByTime(500) })
    act(() => { window.dispatchEvent(new Event('mousemove')) })
    act(() => { jest.advanceTimersByTime(500) })
    expect(result.current).toBe(false)
  })

  it('cleans up on unmount', () => {
    const spy = jest.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIdle())
    unmount()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})