import { extractInvoiceHeaders, hasInvoiceHeaders, getSupportedHeaders } from '../headers';

describe('headers', () => {
  it('extracts company name from headers', () => {
    const result = extractInvoiceHeaders({ 'x-invoice-company-name': 'Acme' });
    expect(result.companyName).toBe('Acme');
  });

  it('returns empty object when no headers present', () => {
    const result = extractInvoiceHeaders({});
    expect(result).toEqual({});
  });

  it('throws on invalid email', () => {
    expect(() => extractInvoiceHeaders({ 'x-invoice-email': 'not-an-email' })).toThrow();
  });

  it('hasInvoiceHeaders returns true when x-invoice-company-name present', () => {
    expect(hasInvoiceHeaders({ 'x-invoice-company-name': 'Test' })).toBe(true);
  });

  it('getSupportedHeaders returns array including x-invoice-email', () => {
    expect(getSupportedHeaders()).toContain('x-invoice-email');
  });
});