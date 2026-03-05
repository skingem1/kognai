import React from 'react';
import { render, screen } from '@testing-library/react';
import { KeyValueList } from '../key-value';

describe('KeyValueList', () => {
  it('renders all items with labels and values', () => {
    render(
      <KeyValueList
        items={[
          { label: 'Name', value: 'John' },
          { label: 'Age', value: '30' },
        ]}
      />
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders dt elements for labels', () => {
    render(<KeyValueList items={[{ label: 'Status', value: 'Active' }]} />);
    const dt = screen.getByText('Status').closest('dt');
    expect(dt).toBeInTheDocument();
  });

  it('renders dd elements for values', () => {
    render(<KeyValueList items={[{ label: 'Status', value: 'Active' }]} />);
    const dd = screen.getByText('Active').closest('dd');
    expect(dd).toBeInTheDocument();
  });

  it('renders empty list when items is empty array', () => {
    const { container } = render(<KeyValueList items={[]} />);
    const dl = container.querySelector('dl');
    expect(dl).toBeInTheDocument();
    expect(dl?.children.length).toBe(0);
  });

  it('applies custom className to dl element', () => {
    const { container } = render(
      <KeyValueList items={[]} className="custom-class" />
    );
    const dl = container.querySelector('dl');
    expect(dl).toHaveClass('custom-class');
  });
});