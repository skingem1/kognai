import { createApiKeyMethods, createWebhookMethods } from '../enhanced-client-extras';

describe('createApiKeyMethods', () => {
  const mockTransport = { request: jest.fn().mockResolvedValue({}) };

  beforeEach(() => jest.clearAllMocks());

  it('createApiKey calls POST /api-keys with name in body', async () => {
    const { createApiKey } = createApiKeyMethods(mockTransport);
    await createApiKey('my-key');
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'POST', path: '/api-keys', body: { name: 'my-key' } });
  });

  it('revokeApiKey calls DELETE /api-keys/:id', async () => {
    const { revokeApiKey } = createApiKeyMethods(mockTransport);
    await revokeApiKey('key-123');
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'DELETE', path: '/api-keys/key-123' });
  });

  it('listApiKeys calls GET /api-keys', async () => {
    const { listApiKeys } = createApiKeyMethods(mockTransport);
    await listApiKeys();
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'GET', path: '/api-keys' });
  });
});

describe('createWebhookMethods', () => {
  const mockTransport = { request: jest.fn().mockResolvedValue({}) };

  beforeEach(() => jest.clearAllMocks());

  it('registerWebhook calls POST /webhooks with config in body', async () => {
    const { registerWebhook } = createWebhookMethods(mockTransport);
    const config = { url: 'https://example.com', events: ['invoice.created'] };
    await registerWebhook(config);
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'POST', path: '/webhooks', body: config });
  });

  it('listWebhooks calls GET /webhooks', async () => {
    const { listWebhooks } = createWebhookMethods(mockTransport);
    await listWebhooks();
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'GET', path: '/webhooks' });
  });

  it('deleteWebhook calls DELETE /webhooks/:id', async () => {
    const { deleteWebhook } = createWebhookMethods(mockTransport);
    await deleteWebhook('wh-456');
    expect(mockTransport.request).toHaveBeenCalledWith({ method: 'DELETE', path: '/webhooks/wh-456' });
  });
});