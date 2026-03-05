import { InvoicaFullClient } from '../src/complete-client';
import { createApiKeyMethods, createWebhookMethods } from '../src/enhanced-client-extras';
import { HttpTransport } from '../src/http-transport';
import { resolveConfig } from '../src/client-config';

jest.mock('../src/enhanced-client', () => ({
  CountableClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/enhanced-client-extras', () => ({
  createApiKeyMethods: jest.fn(() => ({ createApiKey: jest.fn(), revokeApiKey: jest.fn(), listApiKeys: jest.fn() })),
  createWebhookMethods: jest.fn(() => ({ registerWebhook: jest.fn(), listWebhooks: jest.fn(), deleteWebhook: jest.fn() })),
}));

jest.mock('../src/http-transport', () => ({
  HttpTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/client-config', () => ({
  resolveConfig: jest.fn((c) => ({ baseUrl: 'https://api.test.com', apiKey: c.apiKey, timeout: 5000, maxRetries: 3 })),
}));

describe('InvoicaFullClient', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('creates instance with apiKeys and webhooks properties', () => {
    const client = new InvoicaFullClient({ apiKey: 'test-key' });
    expect(client.apiKeys).toBeDefined();
    expect(client.webhooks).toBeDefined();
  });

  it('apiKeys has createApiKey, revokeApiKey, listApiKeys methods', () => {
    const client = new InvoicaFullClient({ apiKey: 'test-key' });
    expect(typeof client.apiKeys.createApiKey).toBe('function');
    expect(typeof client.apiKeys.revokeApiKey).toBe('function');
    expect(typeof client.apiKeys.listApiKeys).toBe('function');
  });

  it('webhooks has registerWebhook, listWebhooks, deleteWebhook methods', () => {
    const client = new InvoicaFullClient({ apiKey: 'test-key' });
    expect(typeof client.webhooks.registerWebhook).toBe('function');
    expect(typeof client.webhooks.listWebhooks).toBe('function');
    expect(typeof client.webhooks.deleteWebhook).toBe('function');
  });

  it('calls resolveConfig with provided config', () => {
    new InvoicaFullClient({ apiKey: 'test-key' });
    expect(resolveConfig).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('instantiates HttpTransport with resolved config', () => {
    new InvoicaFullClient({ apiKey: 'test-key' });
    expect(HttpTransport).toHaveBeenCalledWith({ baseUrl: 'https://api.test.com', apiKey: 'test-key', timeout: 5000, maxRetries: 3 });
  });

  it('calls createApiKeyMethods and createWebhookMethods with transport', () => {
    const transportInstance = {};
    (HttpTransport as jest.Mock).mockImplementation(() => transportInstance);
    new InvoicaFullClient({ apiKey: 'test-key' });
    expect(createApiKeyMethods).toHaveBeenCalledWith(transportInstance);
    expect(createWebhookMethods).toHaveBeenCalledWith(transportInstance);
  });

  it('extends CountableClient', () => {
    const { CountableClient } = require('../src/enhanced-client');
    new InvoicaFullClient({ apiKey: 'test-key' });
    expect(CountableClient).toHaveBeenCalled();
  });
});