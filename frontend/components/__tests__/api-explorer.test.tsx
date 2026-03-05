import { render, screen, fireEvent } from '@testing-library/react';
import ApiExplorer from '../api-explorer';

describe('ApiExplorer', () => {
  beforeEach(() => {
    window.alert = jest.fn();
  });

  it('renders API Explorer heading', () => {
    render(<ApiExplorer />);
    expect(screen.getByRole('heading', { name: 'API Explorer' })).toBeInTheDocument();
  });

  it('renders select with 4 options', () => {
    render(<ApiExplorer />);
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('initially shows POST /v1/invoices endpoint with request body and sample response sections', () => {
    render(<ApiExplorer />);
    expect(screen.getByText('POST /v1/invoices')).toBeInTheDocument();
    expect(screen.getByText('Request Body')).toBeInTheDocument();
    expect(screen.getByText('Sample Response')).toBeInTheDocument();
  });

  it('shows request body JSON for POST endpoint with customer_id', () => {
    render(<ApiExplorer />);
    expect(screen.getByText('customer_id')).toBeInTheDocument();
  });

  it('changing select to GET endpoint shows dash for request body', () => {
    render(<ApiExplorer />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    expect(screen.getByText('Request Body')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows sample response JSON for initial POST /v1/invoices', () => {
    render(<ApiExplorer />);
    expect(screen.getByText(/"id":/)).toBeInTheDocument();
  });

  it('Try It button calls window.alert', () => {
    render(<ApiExplorer />);
    fireEvent.click(screen.getByRole('button', { name: 'Try It' }));
    expect(window.alert).toHaveBeenCalled();
  });

  it('switching to POST /v1/settlements shows amount in request body', () => {
    render(<ApiExplorer />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '2' } });
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.getByText(/settlement.*response/i)).toBeInTheDocument();
  });

  it('changing to health endpoint shows healthy status response', () => {
    render(<ApiExplorer />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '3' } });
    expect(screen.getByText(/"status": "healthy"/)).toBeInTheDocument();
  });
});