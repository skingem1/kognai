import { generateSettlementReport, getSettlementHistory, Settlement } from '../../services/settlement-service';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('SettlementService', () => {
  const mockMerchantId = 'merchant-123';
  const mockStartDate = new Date('2024-01-01');
  const mockEndDate = new Date('2024-01-31');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSettlementReport', () => {
    it('should generate settlement report with aggregated invoice data', async () => {
      const mockInvoices = [
        { id: '1', amount: 1000, currency: 'USD', status: 'paid', created_at: '2024-01-15' },
        { id: '2', amount: 2500, currency: 'USD', status: 'paid', created_at: '2024-01-20' }
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  then: (resolve: (val: { data: typeof mockInvoices; error: null }) => void) => {
                    resolve({ data: mockInvoices, error: null });
                  }
                })
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      const result = await generateSettlementReport(mockMerchantId, mockStartDate, mockEndDate);

      expect(result.merchant_id).toBe(mockMerchantId);
      expect(result.total_invoices).toBe(2);
      expect(result.total_amount).toBe(3500);
      expect(result.currency).toBe('USD');
      expect(result.status).toBe('pending');
    });

    it('should return completed status when no invoices found', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  then: (resolve: (val: { data: null; error: null }) => void) => {
                    resolve({ data: null, error: null });
                  }
                })
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      const result = await generateSettlementReport(mockMerchantId, mockStartDate, mockEndDate);

      expect(result.total_invoices).toBe(0);
      expect(result.total_amount).toBe(0);
      expect(result.status).toBe('completed');
    });

    it('should throw error on database query failure', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  then: (_resolve: any, reject: (err: Error) => void) => {
                    reject(new Error('Database connection failed'));
                  }
                })
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      await expect(generateSettlementReport(mockMerchantId, mockStartDate, mockEndDate))
        .rejects.toThrow('Failed to query invoices');
    });
  });

  describe('getSettlementHistory', () => {
    it('should return settlement history sorted by period_end descending', async () => {
      const mockSettlements: Settlement[] = [
        {
          merchant_id: mockMerchantId,
          period_start: '2024-01-15',
          period_end: '2024-01-31',
          total_invoices: 5,
          total_amount: 5000,
          currency: 'USD',
          usdc_amount: 5000,
          status: 'completed'
        },
        {
          merchant_id: mockMerchantId,
          period_start: '2024-01-01',
          period_end: '2024-01-14',
          total_invoices: 3,
          total_amount: 3000,
          currency: 'USD',
          usdc_amount: 3000,
          status: 'completed'
        }
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                then: (resolve: (val: { data: typeof mockSettlements; error: null }) => void) => {
                  resolve({ data: mockSettlements, error: null });
                }
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      const result = await getSettlementHistory(mockMerchantId, 10);

      expect(result).toHaveLength(2);
      expect(result[0].period_end).toBe('2024-01-31');
    });

    it('should return empty array when no settlements exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                then: (resolve: (val: { data: null; error: null }) => void) => {
                  resolve({ data: null, error: null });
                }
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      const result = await getSettlementHistory(mockMerchantId);

      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                then: (resolve: (val: { data: Settlement[]; error: null }) => void) => {
                  resolve({ data: [], error: null });
                }
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      await getSettlementHistory(mockMerchantId, 5);

      expect(mockQueryBuilder.select).toHaveBeenCalled();
    });

    it('should throw error on query failure', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                then: (_resolve: any, reject: (err: Error) => void) => {
                  reject(new Error('Network error'));
                }
              })
            })
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder as any);

      await expect(getSettlementHistory(mockMerchantId)).rejects.toThrow('Failed to fetch settlements');
    });
  });
});
