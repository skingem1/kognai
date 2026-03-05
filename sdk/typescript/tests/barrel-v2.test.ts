import {
  CountableClient,
  InvoicaFullClient,
  InvoicaError,
  version,
  createDebugLogger,
} from '../src/barrel-v2';

describe('barrel-v2', () => {
  it('CountableClient is exported and is a function', () => {
    expect(CountableClient).toBeDefined();
    expect(typeof CountableClient).toBe('function');
  });

  it('InvoicaFullClient is exported and is a function', () => {
    expect(InvoicaFullClient).toBeDefined();
    expect(typeof InvoicaFullClient).toBe('function');
  });

  it('InvoicaError is exported and is a function', () => {
    expect(InvoicaError).toBeDefined();
    expect(typeof InvoicaError).toBe('function');
  });

  it('version is exported and is a string', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('createDebugLogger is exported and is a function', () => {
    expect(createDebugLogger).toBeDefined();
    expect(typeof createDebugLogger).toBe('function');
  });
});