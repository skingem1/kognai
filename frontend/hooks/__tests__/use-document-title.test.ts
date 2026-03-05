import { renderHook } from '@testing-library/react'
import { useDocumentTitle } from '../use-document-title'

describe('useDocumentTitle', () => {
  afterEach(() => { document.title = '' })

  it('sets document title', () => {
    renderHook(() => useDocumentTitle('Test Page'))
    expect(document.title).toBe('Test Page')
  })

  it('updates title on change', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), { initialProps: { title: 'First' } })
    expect(document.title).toBe('First')
    rerender({ title: 'Second' })
    expect(document.title).toBe('Second')
  })

  it('handles empty string', () => {
    renderHook(() => useDocumentTitle(''))
    expect(document.title).toBe('')
  })
})