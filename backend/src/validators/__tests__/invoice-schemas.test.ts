import { createInvoiceSchema, updateInvoiceSchema, invoiceQuerySchema } from '../invoice-schemas';

describe('Invoice Schemas', () => {
  describe('createInvoiceSchema', () => {
    it('valid with required fields', () => {
      const result = createInvoiceSchema.safeParse({ amount: 100, currency: 'USD' });
      expect(result.success).toBe(true);
    });

    it('valid with all optional fields', () => {
      const result = createInvoiceSchema.safeParse({
        amount: 50, currency: 'EUR', description: 'test',
        customerId: '550e8400-e29b-41d4-a716-446655440000', metadata: { key: 'val' }
      });
      expect(result.success).toBe(true);
    });

    it('invalid: amount not positive', () => {
      expect(createInvoiceSchema.safeParse({ amount: 0, currency: 'USD' }).success).toBe(false);
      expect(createInvoiceSchema.safeParse({ amount: -1, currency: 'USD' }).success).toBe(false);
    });

    it('invalid: currency length', () => {
      expect(createInvoiceSchema.safeParse({ amount: 100, currency: 'US' }).success).toBe(false);
      expect(createInvoiceSchema.safeParse({ amount: 100, currency: 'USDD' }).success).toBe(false);
    });
  });

  describe('updateInvoiceSchema', () => {
    it('valid with status', () => {
      expect(updateInvoiceSchema.safeParse({ status: 'completed' }).success).toBe(true);
    });

    it('valid with description', () => {
      expect(updateInvoiceSchema.safeParse({ description: 'updated' }).success).toBe(true);
    });

    it('invalid: empty object', () => {
      expect(updateInvoiceSchema.safeParse({}).success).toBe(false);
    });

    it('invalid: invalid status', () => {
      expect(updateInvoiceSchema.safeParse({ status: 'invalid_status' as never }).success).toBe(false);
    });
  });

  describe('invoiceQuerySchema', () => {
    it('valid with defaults', () => {
      const result = invoiceQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
      expect(result.data?.offset).toBe(0);
    });

    it('valid with coerced string numbers', () => {
      const result = invoiceQuerySchema.safeParse({ limit: '50', offset: '5' });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(50);
      expect(result.data?.offset).toBe(5);
    });

    it('invalid: limit out of bounds', () => {
      expect(invoiceQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(invoiceQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });
});