import { Request, Response } from 'express';
import { getSettlements } from '../settlements';

describe('getSettlements', () => {
  const mockRes = (): Partial<Response> => ({
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  });

  it('returns settlements with default pagination', async () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    await getSettlements(req, res as Response);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        settlements: expect.any(Array),
        total: 2,
        limit: 10,
        offset: 0,
      })
    );
  });

  it('uses custom pagination params from query', async () => {
    const req = { query: { limit: '5', offset: '1' } } as unknown as Request;
    const res = mockRes();
    await getSettlements(req, res as Response);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 1 })
    );
  });

  it('returns correct settlement data and statuses', async () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    await getSettlements(req, res as Response);
    const { settlements } = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(settlements).toHaveLength(2);
    expect(settlements[0].status).toBe('confirmed');
    expect(settlements[0].txHash).not.toBeNull();
    expect(settlements[0].chain).toBe('base');
    expect(settlements[1].status).toBe('pending');
    expect(settlements[1].txHash).toBeNull();
    expect(settlements[1].confirmedAt).toBeNull();
  });

  it('all settlements have required properties', async () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    await getSettlements(req, res as Response);
    const { settlements } = (res.json as jest.Mock).mock.calls[0][0];
    
    settlements.forEach((s: any) => {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('invoiceId');
      expect(s).toHaveProperty('amount');
      expect(s).toHaveProperty('currency');
      expect(s).toHaveProperty('chain');
      expect(s).toHaveProperty('createdAt');
    });
  });
});