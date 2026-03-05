import { InvoicaFullClient } from '../complete-client-v2';

jest.mock('../enhanced-client-v2', () => ({
  CountableClient: class MockCountableClient {
    constructor(public config: any) {}
    get transport() { return 'mock-transport'; }
  },
}));

const mockApiKeyMethods = {
  createApiKey: jest.fn(),
  revokeApiKey: jest.fn(),
  listApiKeys: jest.fn(),
};

const mockWebhookMethods = {
  registerWebhook: jest.fn(),
  listWebhooks: jest.fn(),
  deleteWebhook: jest.fn(),
};

jest.mock('../enhanced-client-extras', () => ({
  createApiKeyMethods: jest.fn(() => mockApiKeyMethods),
  createWebhookMethods: jest.fn(() => mockWebhookMethods),
}));

import { createApiKeyMethods, createWebhookMethods } from '../enhanced-client-extras';
import { CountableClient } from '../enhanced-client-v2';

describe('InvoicaFullClient', () => {
  const config = { apiKey: 'test-key', baseUrl: 'https://api.test.com' };

  it('calls super with config', () => {
    const client = new InvoicaFullClient(config);
    expect(client.config).toEqual(config);
  });

  it('is instanceof CountableClient', () => {
    const client = new InvoicaFullClient(config);
    expect(client).toBeInstanceOf(CountableClient);
  });

  it('has apiKeys methods', () => {
    const client = new InvoicaFullClient(config);
    expect(client.apiKeys).toBeDefined();
    expect(typeof client.apiKeys.createApiKey).toBe('function');
    expect(typeof client.apiKeys.revokeApiKey).toBe('function');
    expect(typeof client.apiKeys.listApiKeys).toBe('function');
  });

  it('has webhooks methods', () => {
    const client = new InvoicaFullClient(config);
    expect(client.webhooks).toBeDefined();
    expect(typeof client.webhooks.registerWebhook).toBe('function');
    expect(typeof client.webhooks.listWebhooks).toBe('function');
    expect(typeof client.webhooks.deleteWebhook).toBe('function');
  });

  it('calls createApiKeyMethods with transport', () => {
    new InvoicaFullClient(config);
    expect(createApiKeyMethods).toHaveBeenCalledWith('mock-transport');
  });

  it('calls createWebhookMethods with transport', () => {
    new InvoicaFullClient(config);
    expect(createWebhookMethods).toHaveBeenCalledWith('mock-transport');
  });
});