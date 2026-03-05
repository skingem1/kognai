import { render, screen } from '@testing-library/react'
import { Divider } from '../Divider'

describe('Divider', () => {
  it('renders horizontal divider by default', () => {
    render(<Divider />)
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('has horizontal class by default', () => {
    render(<Divider />)
    expect(document.querySelector('.divider-horizontal')).toBeInTheDocument()
  })

  it('renders vertical orientation', () => {
    render(<Divider orientation="vertical" />)
    expect(document.querySelector('.divider-vertical')).toBeInTheDocument()
  })

  it('sets aria-orientation', () => {
    render(<Divider orientation="vertical" />)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('renders label when provided', () => {
    render(<Divider label="OR" />)
    expect(screen.getByText('OR')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<Divider className="my-class" />)
    expect(document.querySelector('.my-class')).toBeInTheDocument()
  })

  it('has divider base class', () => {
    render(<Divider />)
    expect(document.querySelector('.divider')).toBeInTheDocument()
  })
})