import { renderHook } from '@testing-library/react'
import { useLockBodyScroll } from '../use-lock-body-scroll'

describe('useLockBodyScroll', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('locks body scroll when true', () => {
    renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not lock when false', () => {
    document.body.style.overflow = 'auto'
    renderHook(() => useLockBodyScroll(false))
    expect(document.body.style.overflow).toBe('auto')
  })

  it('restores on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = renderHook(() => useLockBodyScroll(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('locks with default parameter', () => {
    renderHook(() => useLockBodyScroll())
    expect(document.body.style.overflow).toBe('hidden')
  })
})