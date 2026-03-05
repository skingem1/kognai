import { register, registrations } from '../../src/services/webhook/types';

describe('webhook register', () => {
  beforeEach(() => registrations.clear());

  it('registers webhook with valid inputs', () => {
    const result = register('https://example.com/hook', ['invoice.created'], 'secret1234567890');
    expect(result.id).toBeDefined();
    expect(result.url).toBe('https://example.com/hook');
    expect(result.events).toEqual(['invoice.created']);
    expect(result.secret).toBe('secret1234567890');
    expect(result.createdAt).toBeDefined();
  });

  it('throws on invalid URL', () => {
    expect(() => register('not-a-url', ['event'], 'secret1234567890')).toThrow();
  });

  it('throws on empty events array', () => {
    expect(() => register('https://example.com', [], 'secret1234567890')).toThrow();
  });

  it('throws on secret too short', () => {
    expect(() => register('https://example.com', ['event'], 'short')).toThrow();
  });

  it('stores registration in map', () => {
    const result = register('https://example.com', ['event'], 'secret1234567890');
    expect(registrations.get(result.id)).toEqual(result);
  });
});