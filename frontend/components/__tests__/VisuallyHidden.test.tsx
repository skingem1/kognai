import { render, screen } from '@testing-library/react'
import { VisuallyHidden } from '../VisuallyHidden'

describe('VisuallyHidden', () => {
  it('renders children', () => {
    render(<VisuallyHidden>Hidden text</VisuallyHidden>)
    expect(screen.getByText('Hidden text')).toBeInTheDocument()
  })

  it('renders as span by default', () => {
    const { container } = render(<VisuallyHidden>Text</VisuallyHidden>)
    expect(container.querySelector('span')).toBeInTheDocument()
  })

  it('renders as div when specified', () => {
    const { container } = render(<VisuallyHidden as="div">Text</VisuallyHidden>)
    expect(container.querySelector('div')).toBeInTheDocument()
  })

  it('applies visually hidden styles', () => {
    const { container } = render(<VisuallyHidden>Text</VisuallyHidden>)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.position).toBe('absolute')
    expect(el.style.overflow).toBe('hidden')
  })

  it('applies className', () => {
    const { container } = render(<VisuallyHidden className="sr-only">Text</VisuallyHidden>)
    expect(container.querySelector('.sr-only')).toBeInTheDocument()
  })

  it('content is in DOM', () => {
    render(<VisuallyHidden>Screen reader text</VisuallyHidden>)
    expect(screen.getByText('Screen reader text')).toBeTruthy()
  })
})