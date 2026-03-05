import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '../search-input';

describe('SearchInput', () => {
  const mockChange = jest.fn();

  beforeEach(() => {
    mockChange.mockClear();
  });

  it('renders input with default placeholder', () => {
    render(<SearchInput value="" onChange={mockChange} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders input with custom placeholder', () => {
    render(<SearchInput value="" onChange={mockChange} placeholder="Find items..." />);
    expect(screen.getByPlaceholderText('Find items...')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<SearchInput value="test value" onChange={mockChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('test value');
  });

  it('calls onChange with new value when typing', () => {
    render(<SearchInput value="" onChange={mockChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new input' } });
    expect(mockChange).toHaveBeenCalledWith('new input');
  });

  it('applies custom className', () => {
    render(<SearchInput value="" onChange={mockChange} className="custom-class" />);
    expect(screen.getByRole('textbox').parentElement).toHaveClass('custom-class');
  });
});