import { Invoice, InvoiceListResponse } from './invoices';

describe('Invoice type', () => {
  it('should have required fields', () => {
    const invoice: Invoice = {
      id: '1',
      invoiceNumber: 'INV-001',
      amount: 1000,
      currency: 'USD',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(invoice.id).toBe('1');
    expect(invoice.amount).toBe(1000);
  });

  it('should accept all valid status values', () => {
    const statuses: Invoice['status'][] = ['pending', 'paid', 'overdue', 'cancelled'];
    statuses.forEach((status) => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        amount: 100,
        currency: 'USD',
        status,
        createdAt: '2024-01-01T00:00:00Z',
      };
      expect(invoice.status).toBe(status);
    });
  });
});

describe('InvoiceListResponse type', () => {
  it('should have correct structure', () => {
    const response: InvoiceListResponse = {
      invoices: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    };
    expect(response.invoices).toEqual([]);
    expect(response.pagination.page).toBe(1);
  });

  it('should accept populated invoices array', () => {
    const invoice: Invoice = {
      id: '1',
      invoiceNumber: 'INV-001',
      amount: 500,
      currency: 'EUR',
      status: 'paid',
      createdAt: '2024-01-15T00:00:00Z',
    };
    const response: InvoiceListResponse = {
      invoices: [invoice],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };
    expect(response.invoices).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
  });
});