import { Request, Response } from 'express';
import { createInvoice, createInvoiceSchema } from '../../src/api/invoices-create';
import { createPendingInvoice } from '../../src/services/invoice';

jest.mock('../../src/services/invoice');

const mockCreatePendingInvoice = createPendingInvoice as jest.MockedFunction<typeof createPendingInvoice>;

describe('createInvoice', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockReq = { body: {} };
    mockRes = { status: statusMock, json: jsonMock };
  });

  it('returns 201 and creates invoice on valid data', async () => {
    mockReq.body = { amount: 1000, currency: 'USD', customerEmail: 'test@example.com', customerName: 'Test User' };
    mockCreatePendingInvoice.mockResolvedValue({
      id: 'inv-123',
      invoiceNumber: 1,
      amount: 1000n,
      currency: 'USD',
      status: 'PENDING' as const,
      customerEmail: 'test@example.com',
      customerName: 'Test User',
      createdAt: new Date('2024-01-01'),
    });

    await createInvoice(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-123', number: 'INV-1', status: 'pending' }));
  });

  it('returns 400 on invalid email', async () => {
    mockReq.body = { amount: 100, currency: 'USD', customerEmail: 'invalid', customerName: 'User' };

    await createInvoice(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it('returns 500 when service throws', async () => {
    mockReq.body = { amount: 100, currency: 'USD', customerEmail: 'test@test.com', customerName: 'User' };
    mockCreatePendingInvoice.mockRejectedValue(new Error('DB error'));

    await createInvoice(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(500);
  });

  it('validates createInvoiceSchema correctly', () => {
    expect(createInvoiceSchema.safeParse({ amount: 100, currency: 'USD', customerEmail: 'a@b.com', customerName: 'Name' }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ amount: -1, currency: 'USD', customerEmail: 'a@b.com', customerName: 'Name' }).success).toBe(false);
  });
});