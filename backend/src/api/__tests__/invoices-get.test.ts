import { Request, Response } from 'express';
import { getInvoiceById, mockGetInvoiceById } from '../invoices-get';

jest.mock('../invoices-get', () => ({
  ...jest.requireActual('../invoices-get'),
  mockGetInvoiceById: jest.fn(),
}));

describe('getInvoiceById', () => {
  let mockRes: Response;

  beforeEach(() => {
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as unknown as Response;
    jest.clearAllMocks();
  });

  it('returns 200 with invoice for valid id', async () => {
    const mockInvoice = {
      id: 'inv_001',
      number: 'INV-001',
      amount: 0,
      currency: 'USD',
      status: 'pending',
      createdAt: new Date().toISOString(),
      paidAt: null,
      metadata: {},
    };
    (mockGetInvoiceById as jest.Mock).mockResolvedValue(mockInvoice);
    const mockReq = { params: { id: 'inv_001' } } as unknown as Request;

    await getInvoiceById(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(mockInvoice);
  });

  it('returns 400 for empty id', async () => {
    const mockReq = { params: { id: '' } } as unknown as Request;

    await getInvoiceById(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid invoice ID' });
  });

  it('returns 400 for undefined id', async () => {
    const mockReq = { params: {} } as unknown as Request;

    await getInvoiceById(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid invoice ID' });
  });
});