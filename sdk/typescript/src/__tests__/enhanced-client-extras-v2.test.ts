import { createApiKeyMethods, createWebhookMethods } from '../enhanced-client-extras-v2';

describe('enhanced-client-extras-v2', () => {
  const mockTransport = { request: jest.fn().mockResolvedValue({}) };

  beforeEach(() => jest.clearAllMocks());

  describe('createApiKeyMethods', () => {
    it('createApiKey calls POST /api-keys with body', async () => {
      const { createApiKey } = createApiKeyMethods(mockTransport);
      await createApiKey('test-key');
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'POST', path: '/api-keys', body: { name: 'test-key' } });
    });

    it('revokeApiKey calls DELETE /api-keys/:id', async () => {
      const { revokeApiKey } = createApiKeyMethods(mockTransport);
      await revokeApiKey('key-1');
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'DELETE', path: '/api-keys/key-1' });
    });

    it('listApiKeys calls GET /api-keys', async () => {
      const { listApiKeys } = createApiKeyMethods(mockTransport);
      await listApiKeys();
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'GET', path: '/api-keys' });
    });
  });

  describe('createWebhookMethods', () => {
    it('registerWebhook passes config as body', async () => {
      const { registerWebhook } = createWebhookMethods(mockTransport);
      const config = { url: 'https://example.com', events: ['payment'] };
      await registerWebhook(config);
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'POST', path: '/webhooks', body: config });
    });

    it('deleteWebhook interpolates id in path', async () => {
      const { deleteWebhook } = createWebhookMethods(mockTransport);
      await deleteWebhook('wh-123');
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'DELETE', path: '/webhooks/wh-123' });
    });

    it('listWebhooks calls GET /webhooks', async () => {
      const { listWebhooks } = createWebhookMethods(mockTransport);
      await listWebhooks();
      expect(mockTransport.request).toHaveBeenCalledWith({ method: 'GET', path: '/webhooks' });
    });
  });
});