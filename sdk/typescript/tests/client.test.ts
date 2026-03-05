import { InvoicaClient } from '../src/client';
import { InvoicaConfig } from '../src/config';
import { Invoice, SettlementStatus } from '../src/types';

const mockConfig: InvoicaConfig = { apiKey: 'test-key', baseUrl: 'http://localhost' };

describe('InvoicaClient', () => {
  let client: InvoicaClient;

  beforeEach(() => { client = new InvoicaClient(mockConfig); });

  describe('listInvoices', () => {
    it('should fetch invoices with pagination params', async () => {
      const mockResponse = { invoices: [{ id: '1', amount: 100 }] as Invoice[], total: 1, limit: 10, offset: 0 };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
      
      const result = await client.listInvoices({ limit: 10, offset: 0 });
      
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('http://localhost/v1/invoices?limit=10&offset=0', expect.any(Object));
    });

    it('should filter out undefined params from query string', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ invoices: [], total: 0, limit: 10, offset: 0 }) });
      
      await client.listInvoices({ limit: 10 });
      const calledUrl = (fetch as jest.Mock).mock.calls[0][0];
      
      expect(calledUrl).not.toContain('undefined');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).not.toContain('offset');
    });

    it('should call with empty params when none provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ invoices: [], total: 0, limit: 10, offset: 0 }) });
      
      await client.listInvoices();
      
      expect(fetch).toHaveBeenCalledWith('http://localhost/v1/invoices', expect.any(Object));
    });

    it('should throw error on failed request', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      
      await expect(client.listInvoices()).rejects.toThrow('Request failed with status 500');
    });
  });

  describe('listSettlements', () => {
    it('should handle optional invoiceId parameter', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ invoiceId: '1' } as SettlementStatus]) });
      
      const result = await client.listSettlements('1');
      expect(result).toHaveLength(1);
    });
  });
});