import { Request, Response } from 'express';
import { getSettlement } from '../../src/api/settlements';
import { prisma } from '../../src/db/client';

jest.mock('../../src/db/client');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

const mockRes = {
  json: mockJson,
  status: mockStatus,
} as unknown as Response;

beforeEach(() => jest.clearAllMocks());

describe('getSettlement', () => {
  it('returns 404 when invoice not found', async () => {
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(null);
    const mockReq = { params: { invoiceId: 'inv-123' } } as unknown as Request;

    await getSettlement(mockReq, mockRes);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({ error: 'Invoice not found' });
  });

  it('returns confirmed for SETTLED invoice', async () => {
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-123',
      status: 'SETTLED',
      amount: 1000,
      currency: 'USD',
      settledAt: new Date('2024-01-01'),
      paymentDetails: { txHash: '0xabc', chain: 'ethereum' },
    });
    const mockReq = { params: { invoiceId: 'inv-123' } } as unknown as Request;

    await getSettlement(mockReq, mockRes);

    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'inv-123',
      status: 'confirmed',
      txHash: '0xabc',
      chain: 'ethereum',
      amount: 1000,
      currency: 'USD',
    }));
  });

  it('returns confirmed for COMPLETED invoice', async () => {
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-456',
      status: 'COMPLETED',
      amount: 500,
      currency: 'EUR',
      settledAt: new Date('2024-02-01'),
      paymentDetails: { txHash: '0xdef', chain: 'polygon' },
    });
    const mockReq = { params: { invoiceId: 'inv-456' } } as unknown as Request;

    await getSettlement(mockReq, mockRes);

    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  });

  it('returns pending for PENDING invoice', async () => {
    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv-789',
      status: 'PENDING',
      amount: 200,
      currency: 'USD',
      settledAt: null,
      paymentDetails: null,
    });
    const mockReq = { params: { invoiceId: 'inv-789' } } as unknown as Request;

    await getSettlement(mockReq, mockRes);

    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      txHash: null,
      chain: 'ethereum',
      confirmedAt: null,
    }));
  });
});