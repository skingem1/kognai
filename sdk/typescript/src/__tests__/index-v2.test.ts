import {
  CountableClient,
  InvoicaFullClient,
  HttpTransport,
  InvoicaError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  CountableError,
  RateLimitError,
  parseResponse,
  isApiError,
  createDebugLogger,
  isDebugEnabled,
  createApiKeyMethods,
  createWebhookMethods,
  createInterceptorManager,
  detectEnvironment,
  version,
} from '../index-v2';

describe('index-v2.ts barrel exports', () => {
  const fnExports = [
    CountableClient,
    InvoicaFullClient,
    HttpTransport,
    InvoicaError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    CountableError,
    RateLimitError,
    parseResponse,
    isApiError,
    createDebugLogger,
    isDebugEnabled,
    createApiKeyMethods,
    createWebhookMethods,
    createInterceptorManager,
    detectEnvironment,
  ];

  const stringExport = version;

  it('should export CountableClient as function', () => {
    expect(typeof CountableClient).toBe('function');
  });

  it('should export InvoicaFullClient as function', () => {
    expect(typeof InvoicaFullClient).toBe('function');
  });

  it('should export HttpTransport as function', () => {
    expect(typeof HttpTransport).toBe('function');
  });

  it('should export InvoicaError as function', () => {
    expect(typeof InvoicaError).toBe('function');
  });

  it('should export ValidationError as function', () => {
    expect(typeof ValidationError).toBe('function');
  });

  it('should export NotFoundError as function', () => {
    expect(typeof NotFoundError).toBe('function');
  });

  it('should export AuthenticationError as function', () => {
    expect(typeof AuthenticationError).toBe('function');
  });

  it('should export CountableError as function', () => {
    expect(typeof CountableError).toBe('function');
  });

  it('should export RateLimitError as function', () => {
    expect(typeof RateLimitError).toBe('function');
  });

  it('should export parseResponse as function', () => {
    expect(typeof parseResponse).toBe('function');
  });

  it('should export isApiError as function', () => {
    expect(typeof isApiError).toBe('function');
  });

  it('should export createDebugLogger as function', () => {
    expect(typeof createDebugLogger).toBe('function');
  });

  it('should export isDebugEnabled as function', () => {
    expect(typeof isDebugEnabled).toBe('function');
  });

  it('should export createApiKeyMethods as function', () => {
    expect(typeof createApiKeyMethods).toBe('function');
  });

  it('should export createWebhookMethods as function', () => {
    expect(typeof createWebhookMethods).toBe('function');
  });

  it('should export createInterceptorManager as function', () => {
    expect(typeof createInterceptorManager).toBe('function');
  });

  it('should export detectEnvironment as function', () => {
    expect(typeof detectEnvironment).toBe('function');
  });

  it('should export version as string', () => {
    expect(typeof version).toBe('string');
  });

  it('should export all function exports as functions', () => {
    fnExports.forEach((exp) => expect(typeof exp).toBe('function'));
  });
});