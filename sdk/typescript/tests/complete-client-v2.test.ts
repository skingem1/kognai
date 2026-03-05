import { CompleteClientV2 } from '../src/complete-client-v2';

describe('CompleteClientV2', () => {
  const config = { baseUrl: 'http://test.local', apiKey: 'sk_test123' };

  it('should create instance without throwing', () => {
    expect(() => new CompleteClientV2(config)).not.toThrow();
  });

  it('should have invoices property', () => {
    const client = new CompleteClientV2(config);
    expect(client).toHaveProperty('invoices');
  });

  it('should have settlements property', () => {
    const client = new CompleteClientV2(config);
    expect(client).toHaveProperty('settlements');
  });

  it('should have apiKeys property', () => {
    const client = new CompleteClientV2(config);
    expect(client).toHaveProperty('apiKeys');
  });

  it('should have webhooks property', () => {
    const client = new CompleteClientV2(config);
    expect(client).toHaveProperty('webhooks');
  });
});