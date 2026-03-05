import { InvoicaConfig, RequestOptions } from '../src/config';

describe('InvoicaConfig', () => {
  it('should create config with required fields', () => {
    const config: InvoicaConfig = { baseUrl: 'https://api.invoica.io', apiKey: 'test-key' };
    expect(config.baseUrl).toBe('https://api.invoica.io');
    expect(config.apiKey).toBe('test-key');
  });

  it('should accept empty strings for fields', () => {
    const config: InvoicaConfig = { baseUrl: '', apiKey: '' };
    expect(config.baseUrl).toBe('');
    expect(config.apiKey).toBe('');
  });
});

describe('RequestOptions', () => {
  it('should create options with all fields', () => {
    const options: RequestOptions = {
      query: { page: '1', limit: '10' },
      headers: { 'Content-Type': 'application/json' },
      body: { amount: 100 }
    };
    expect(options.query?.page).toBe('1');
    expect(options.headers?.['Content-Type']).toBe('application/json');
    expect(options.body).toEqual({ amount: 100 });
  });

  it('should allow undefined optional fields', () => {
    const options: RequestOptions = {};
    expect(options.query).toBeUndefined();
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeUndefined();
  });
});