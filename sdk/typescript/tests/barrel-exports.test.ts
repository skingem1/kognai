import * as SDK from '../src/index';

describe('SDK barrel exports', () => {
  it('exports CountableClient class', () => {
    expect(SDK.CountableClient).toBeDefined();
    expect(typeof SDK.CountableClient).toBe('function');
  });

  it('exports InvoicaFullClient class', () => {
    expect(SDK.InvoicaFullClient).toBeDefined();
    expect(typeof SDK.InvoicaFullClient).toBe('function');
  });

  it('exports error classes', () => {
    expect(SDK.InvoicaError).toBeDefined();
    expect(SDK.ValidationError).toBeDefined();
    expect(SDK.NotFoundError).toBeDefined();
    expect(SDK.AuthenticationError).toBeDefined();
    expect(SDK.CountableError).toBeDefined();
    expect(SDK.RateLimitError).toBeDefined();
  });

  it('exports utility functions', () => {
    expect(SDK.createDebugLogger).toBeDefined();
    expect(SDK.isDebugEnabled).toBeDefined();
    expect(SDK.detectEnvironment).toBeDefined();
    expect(SDK.version).toBeDefined();
  });

  it('exports HttpTransport class', () => {
    expect(SDK.HttpTransport).toBeDefined();
    expect(typeof SDK.HttpTransport).toBe('function');
  });
});