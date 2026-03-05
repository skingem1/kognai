import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from '../tabs';

const mockTabs = [
  { id: 'a', label: 'Tab A', content: <p>Content A</p> },
  { id: 'b', label: 'Tab B', content: <p>Content B</p> },
  { id: 'c', label: 'Tab C', content: <p>Content C</p> },
];

describe('Tabs', () => {
  it('renders all tab labels as buttons', () => {
    render(<Tabs tabs={mockTabs} />);
    expect(screen.getByRole('button', { name: 'Tab A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tab B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tab C' })).toBeInTheDocument();
  });

  it('shows first tab content by default', () => {
    render(<Tabs tabs={mockTabs} />);
    expect(screen.getByText('Content A')).toBeInTheDocument();
    expect(screen.queryByText('Content B')).not.toBeInTheDocument();
  });

  it('switches content when tab button is clicked', () => {
    render(<Tabs tabs={mockTabs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tab B' }));
    expect(screen.getByText('Content B')).toBeInTheDocument();
    expect(screen.queryByText('Content A')).not.toBeInTheDocument();
  });

  it('shows content based on defaultTabId', () => {
    render(<Tabs tabs={mockTabs} defaultTabId="b" />);
    expect(screen.getByText('Content B')).toBeInTheDocument();
    expect(screen.queryByText('Content A')).not.toBeInTheDocument();
  });

  it('applies className to outer div', () => {
    const { container } = render(<Tabs tabs={mockTabs} className="test-class" />);
    expect(container.firstChild).toHaveClass('test-class');
  });
});