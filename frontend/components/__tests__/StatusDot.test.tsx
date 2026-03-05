import { render, screen } from '@testing-library/react'
import { StatusDot } from '../StatusDot'

describe('StatusDot', () => {
  it('renders with status class', () => {
    const { container } = render(<StatusDot status="success" />)
    expect(container.querySelector('.status-dot-success')).toBeInTheDocument()
  })

  it('renders with default size md', () => {
    const { container } = render(<StatusDot status="info" />)
    expect(container.querySelector('.status-dot-md')).toBeInTheDocument()
  })

  it('renders with sm size', () => {
    const { container } = render(<StatusDot status="info" size="sm" />)
    expect(container.querySelector('.status-dot-sm')).toBeInTheDocument()
  })

  it('renders pulse class when pulse is true', () => {
    const { container } = render(<StatusDot status="error" pulse />)
    expect(container.querySelector('.status-dot-pulse')).toBeInTheDocument()
  })

  it('no pulse class by default', () => {
    const { container } = render(<StatusDot status="error" />)
    expect(container.querySelector('.status-dot-pulse')).not.toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<StatusDot status="success" label="Online" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('no label when not provided', () => {
    const { container } = render(<StatusDot status="info" />)
    expect(container.querySelector('.status-dot-label')).not.toBeInTheDocument()
  })

  it('renders indicator element', () => {
    const { container } = render(<StatusDot status="warning" />)
    expect(container.querySelector('.status-dot-indicator')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<StatusDot status="neutral" className="custom" />)
    expect(container.querySelector('.custom')).toBeInTheDocument()
  })
})