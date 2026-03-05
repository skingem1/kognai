import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../data-table';

jest.mock('../../loading-spinner', () => ({
  LoadingSpinner: () => React.createElement('div', { role: 'status' }, 'Loading...'),
}));

jest.mock('../../empty-state', () => ({
  EmptyState: ({ message }: { message: string }) => React.createElement('div', null, message),
}));

describe('DataTable', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'age', label: 'Age' },
  ];
  const data = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ];

  it('shows LoadingSpinner when loading=true', () => {
    render(<DataTable columns={columns} data={data} loading={true} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows EmptyState when data is empty', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows custom emptyMessage', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No users found" />);
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('renders table headers and data rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('uses custom render function when column has render prop', () => {
    const cols = [{ key: 'name', label: 'Name', render: (row: any) => row.name.toUpperCase() }];
    render(<DataTable columns={cols} data={[{ name: 'Alice' }]} />);
    expect(screen.getByText('ALICE')).toBeInTheDocument();
  });

  it('calls onRowClick with row data and adds cursor-pointer class', () => {
    const onRowClick = jest.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);
    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveClass('cursor-pointer');
    fireEvent.click(rows[0]);
    expect(onRowClick).toHaveBeenCalledWith({ name: 'Alice', age: 30 });
  });

  it('renders null/undefined as empty string', () => {
    render(<DataTable columns={columns} data={[{ name: 'Alice', age: null as any }, { name: 'Bob', age: undefined as any }]} />);
    const cells = document.querySelectorAll('tbody td');
    expect(cells[1].textContent).toBe('');
    expect(cells[3].textContent).toBe('');
  });
});