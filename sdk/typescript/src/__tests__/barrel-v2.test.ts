import * as barrel from '../barrel-v2';

describe('barrel-v2', () => {
  it('exports CountableClient, InvoicaFullClient, HttpTransport', () => {
    expect(barrel.CountableClient).toBeDefined();
    expect(barrel.InvoicaFullClient).toBeDefined();
    expect(barrel.HttpTransport).toBeDefined();
  });

  it('exports error classes', () => {
    expect(barrel.InvoicaError).toBeDefined();
    expect(barrel.ValidationError).toBeDefined();
    expect(barrel.NotFoundError).toBeDefined();
    expect(barrel.AuthenticationError).toBeDefined();
  });

  it('exports error-compat classes', () => {
    expect(barrel.CountableError).toBeDefined();
    expect(barrel.RateLimitError).toBeDefined();
  });

  it('exports debug utilities', () => {
    expect(barrel.createDebugLogger).toBeDefined();
    expect(barrel.isDebugEnabled).toBeDefined();
  });

  it('exports client extras and interceptors', () => {
    expect(barrel.createApiKeyMethods).toBeDefined();
    expect(barrel.createWebhookMethods).toBeDefined();
    expect(barrel.createInterceptorManager).toBeDefined();
  });

  it('exports environment utilities', () => {
    expect(barrel.detectEnvironment).toBeDefined();
    expect(typeof barrel.detectEnvironment).toBe('function');
    expect(barrel.getDefaultBaseUrl).toBeDefined();
    expect(barrel.getUserAgent).toBeDefined();
    expect(barrel.supportsStreaming).toBeDefined();
  });

  it('exports version as string', () => {
    expect(barrel.version).toBeDefined();
    expect(typeof barrel.version).toBe('string');
  });
});