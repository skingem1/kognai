import { render, screen } from '@testing-library/react'
import { Truncate } from '../Truncate'

describe('Truncate', () => {
  it('renders full text when under maxLength', () => {
    render(<Truncate text="Hello" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('truncates long text with ellipsis', () => {
    render(<Truncate text="abcdefghij" maxLength={5} />)
    expect(screen.getByText('abcde...')).toBeInTheDocument()
  })

  it('uses custom ellipsis', () => {
    render(<Truncate text="abcdefghij" maxLength={5} ellipsis="…" />)
    expect(screen.getByText('abcde…')).toBeInTheDocument()
  })

  it('shows title tooltip when truncated', () => {
    const { container } = render(<Truncate text="abcdefghij" maxLength={5} />)
    expect(container.querySelector('[title="abcdefghij"]')).toBeInTheDocument()
  })

  it('no title when not truncated', () => {
    const { container } = render(<Truncate text="Hi" maxLength={10} />)
    expect(container.querySelector('[title]')).not.toBeInTheDocument()
  })

  it('has aria-label with full text', () => {
    render(<Truncate text="abcdefghij" maxLength={5} />)
    expect(screen.getByLabelText('abcdefghij')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Truncate text="Hi" className="custom" />)
    expect(container.querySelector('.custom')).toBeInTheDocument()
  })

  it('has truncate-text class', () => {
    const { container } = render(<Truncate text="Hi" />)
    expect(container.querySelector('.truncate-text')).toBeInTheDocument()
  })
})