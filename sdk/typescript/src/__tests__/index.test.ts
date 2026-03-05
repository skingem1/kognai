import * as exports from '../index';

describe('index.ts barrel exports', () => {
  it('CountableClient is exported and is a function', () => {
    expect(typeof exports.CountableClient).toBe('function');
  });

  it('InvoicaFullClient is exported and is a function', () => {
    expect(typeof exports.InvoicaFullClient).toBe('function');
  });

  it('HttpTransport is exported and is a function', () => {
    expect(typeof exports.HttpTransport).toBe('function');
  });

  it('InvoicaError is exported and is a function', () => {
    expect(typeof exports.InvoicaError).toBe('function');
  });

  it('ValidationError is exported and is a function', () => {
    expect(typeof exports.ValidationError).toBe('function');
  });

  it('NotFoundError is exported and is a function', () => {
    expect(typeof exports.NotFoundError).toBe('function');
  });

  it('AuthenticationError is exported and is a function', () => {
    expect(typeof exports.AuthenticationError).toBe('function');
  });

  it('CountableError is exported and is a function', () => {
    expect(typeof exports.CountableError).toBe('function');
  });

  it('RateLimitError is exported and is a function', () => {
    expect(typeof exports.RateLimitError).toBe('function');
  });

  it('parseResponse is exported and is a function', () => {
    expect(typeof exports.parseResponse).toBe('function');
  });

  it('isApiError is exported and is a function', () => {
    expect(typeof exports.isApiError).toBe('function');
  });

  it('createDebugLogger is exported and is a function', () => {
    expect(typeof exports.createDebugLogger).toBe('function');
  });

  it('isDebugEnabled is exported and is a function', () => {
    expect(typeof exports.isDebugEnabled).toBe('function');
  });

  it('createApiKeyMethods is exported and is a function', () => {
    expect(typeof exports.createApiKeyMethods).toBe('function');
  });

  it('createWebhookMethods is exported and is a function', () => {
    expect(typeof exports.createWebhookMethods).toBe('function');
  });

  it('createInterceptorManager is exported and is a function', () => {
    expect(typeof exports.createInterceptorManager).toBe('function');
  });

  it('detectEnvironment is exported and is a function', () => {
    expect(typeof exports.detectEnvironment).toBe('function');
  });

  it('version is exported and is a string', () => {
    expect(typeof exports.version).toBe('string');
  });
});