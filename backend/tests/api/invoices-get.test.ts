import { Request, Response } from 'express';
import { getInvoiceById } from '../../src/api/invoices-get';

describe('getInvoiceById', () => {
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = { status: statusMock, json: jsonMock };
  });

  it('returns 200 with invoice for valid id', async () => {
    const req = { params: { id: 'abc123' } } as unknown as Request;
    await getInvoiceById(req, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc123', number: 'INV-001' })
    );
  });

  it('returns 400 for empty id', async () => {
    const req = { params: { id: '' } } as unknown as Request;
    await getInvoiceById(req, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid invoice ID' });
  });

  it('returns 400 for missing id', async () => {
    const req = { params: {} } as unknown as Request;
    await getInvoiceById(req, mockRes as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
  });

  it('returns pending status in response', async () => {
    const req = { params: { id: 'test-id' } } as unknown as Request;
    await getInvoiceById(req, mockRes as Response);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', currency: 'USD' })
    );
  });
});