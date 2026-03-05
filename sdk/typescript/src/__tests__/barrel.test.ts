import {
  CountableClient,
  InvoicaError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  CountableError,
  RateLimitError,
  HttpTransport,
  createDebugLogger,
  isDebugEnabled,
  createApiKeyMethods,
  createWebhookMethods,
  version,
} from '../barrel';

describe('barrel exports', () => {
  it('exports all modules are defined', () => {
    expect(CountableClient).toBeDefined();
    expect(InvoicaError).toBeDefined();
    expect(ValidationError).toBeDefined();
    expect(NotFoundError).toBeDefined();
    expect(AuthenticationError).toBeDefined();
    expect(CountableError).toBeDefined();
    expect(RateLimitError).toBeDefined();
    expect(HttpTransport).toBeDefined();
    expect(createDebugLogger).toBeDefined();
    expect(isDebugEnabled).toBeDefined();
    expect(createApiKeyMethods).toBeDefined();
    expect(createWebhookMethods).toBeDefined();
    expect(version).toBeDefined();
  });

  it('version is a string', () => {
    expect(typeof version).toBe('string');
  });

  it('error classes are constructable', () => {
    expect(new InvoicaError('test', 400, 'CODE')).toBeInstanceOf(Error);
  });
});