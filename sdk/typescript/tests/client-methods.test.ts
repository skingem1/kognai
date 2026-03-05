
import { InvoicaClient } from '../src/client';

global.fetch = jest.fn();

describe('InvoicaClient API Key & Webhook Methods', () => {
  let client: InvoicaClient;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = global.fetch as jest.Mock;
    mockFetch.mockReset();
    client = new InvoicaClient({ apiKey: 'test-key', baseUrl: 'https://api.test.com' });
  });

  it('createApiKey calls POST /api-keys with name in body', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'key-1', name: 'Test Key' }) });
    await client.createApiKey({ name: 'Test Key' });
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/api-keys', expect.objectContaining({ method: 'POST' }));
  });

  it('revokeApiKey calls DELETE /api-keys/{id}', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await client.revokeApiKey('key-1');
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/api-keys/key-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('listApiKeys calls GET /api-keys', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ apiKeys: [] }) });
    await client.listApiKeys();
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/api-keys', expect.objectContaining({ method: 'GET' }));
  });

  it('registerWebhook calls POST /webhooks with config body', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'wh-1', url: 'https://example.com/hook' }) });
    await client.registerWebhook({ url: 'https://example.com/hook', events: ['invoice.created'] });
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/webhooks', expect.objectContaining({ method: 'POST' }));
  });

  it('listWebhooks calls GET /webhooks', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ webhooks: [] }) });
    await client.listWebhooks();
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/webhooks', expect.objectContaining({ method: 'GET' }));
  });

  it('deleteWebhook calls DELETE /webhooks/{id}', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await client.deleteWebhook('wh-1');
    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/webhooks/wh-1', expect.objectContaining({ method: 'DELETE' }));
  });
});
