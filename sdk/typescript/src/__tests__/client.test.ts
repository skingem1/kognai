const mockRequest = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => ({ request: mockRequest })), isAxiosError: jest.fn() },
}));

import axios from 'axios';
import { InvoicaClient } from '../client';

describe('InvoicaClient', () => {
  let client: InvoicaClient;
  beforeEach(() => { client = new InvoicaClient({ baseUrl: 'https://api.test.com', apiKey: 'test-key-123' }); jest.clearAllMocks(); });

  it('getInvoice returns invoice data', async () => {
    mockRequest.mockResolvedValueOnce({ data: { id: 'inv_1', number: 'INV-001' } });
    const result = await client.getInvoice('inv_1');
    expect(result).toEqual({ id: 'inv_1', number: 'INV-001' });
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: '/invoices/inv_1' }));
  });

  it('createInvoice sends POST request with body', async () => {
    mockRequest.mockResolvedValueOnce({ data: { id: 'inv_2', number: 'INV-002', amount: 100 } });
    const result = await client.createInvoice({ amount: 100, customerId: 'cust_1' });
    expect(result).toEqual({ id: 'inv_2', number: 'INV-002', amount: 100 });
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/invoices', data: { amount: 100, customerId: 'cust_1' } }));
  });

  it('listApiKeys returns API keys array', async () => {
    mockRequest.mockResolvedValueOnce({ data: [{ id: 'key_1', name: 'Test Key' }] });
    const result = await client.listApiKeys();
    expect(result).toEqual([{ id: 'key_1', name: 'Test Key' }]);
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: '/api-keys' }));
  });

  it('deleteWebhook sends DELETE request', async () => {
    mockRequest.mockResolvedValueOnce({ data: undefined });
    await client.deleteWebhook('wh_1');
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', url: '/webhooks/wh_1' }));
  });

  it('handles axios errors with message', async () => {
    mockRequest.mockRejectedValueOnce({ response: { data: { message: 'Not found' } }, message: 'Request failed', isAxiosError: true });
    (axios as any).isAxiosError.mockReturnValue(true);
    await expect(client.getInvoice('x')).rejects.toThrow('Invoica API Error: Not found');
  });

  it('rethrows non-axios errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network'));
    (axios as any).isAxiosError.mockReturnValue(false);
    await expect(client.getInvoice('x')).rejects.toThrow('network');
  });
});