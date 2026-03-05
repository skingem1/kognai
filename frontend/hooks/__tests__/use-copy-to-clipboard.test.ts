import { renderHook, act } from '@testing-library/react'
import { useCopyToClipboard } from '../use-copy-to-clipboard'

Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
beforeEach(() => { jest.useFakeTimers(); (navigator.clipboard.writeText as jest.Mock).mockClear() })
afterEach(() => { jest.useRealTimers() })

describe('useCopyToClipboard', () => {
  it('initially not copied', () => {
    const { result } = renderHook(() => useCopyToClipboard())
    expect(result.current[0]).toBe(false)
  })
  it('copies text and sets copied to true', async () => {
    const { result } = renderHook(() => useCopyToClipboard())
    await act(async () => { await result.current[1]('hello') })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    expect(result.current[0]).toBe(true)
  })
  it('resets copied after 2 seconds', async () => {
    const { result } = renderHook(() => useCopyToClipboard())
    await act(async () => { await result.current[1]('hello') })
    expect(result.current[0]).toBe(true)
    act(() => { jest.advanceTimersByTime(2001) })
    expect(result.current[0]).toBe(false)
  })
})