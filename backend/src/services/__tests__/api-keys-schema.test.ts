import { createApiKeySchema, getApiKeyMetadata, ApiKey } from '../api-keys';

describe('api-keys/schema', () => {
  it('accepts valid input with all fields', () => {
    const input = {
      customerId: 'cust_123',
      customerEmail: 'test@example.com',
      name: 'My API Key',
      tier: 'premium',
      plan: 'enterprise',
      permissions: ['read', 'write'],
      expiresInDays: 30,
    };
    const result = createApiKeySchema.parse(input);
    expect(result.tier).toBe('premium');
    expect(result.plan).toBe('enterprise');
    expect(result.permissions).toEqual(['read', 'write']);
  });

  it('rejects missing customerId', () => {
    const input = { customerEmail: 'test@example.com', name: 'Key' };
    expect(() => createApiKeySchema.parse(input)).toThrow();
  });

  it('rejects invalid email', () => {
    const input = { customerId: 'cust_123', customerEmail: 'invalid', name: 'Key' };
    expect(() => createApiKeySchema.parse(input)).toThrow();
  });

  it('defaults tier to free when not provided', () => {
    const input = { customerId: 'cust_123', customerEmail: 'test@example.com', name: 'Key' };
    const result = createApiKeySchema.parse(input);
    expect(result.tier).toBe('free');
  });

  it('defaults permissions to empty array', () => {
    const input = { customerId: 'cust_123', customerEmail: 'test@example.com', name: 'Key' };
    const result = createApiKeySchema.parse(input);
    expect(result.permissions).toEqual([]);
  });

  it('getApiKeyMetadata removes keyHash but keeps other fields', () => {
    const apiKey: ApiKey = {
      id: 'key_1',
      keyHash: 'secret_hash',
      customerId: 'cust_123',
      customerEmail: 'test@example.com',
      name: 'My Key',
      tier: 'free',
      plan: 'basic',
      permissions: ['read'],
      createdAt: new Date(),
      expiresAt: new Date(),
    };
    const metadata = getApiKeyMetadata(apiKey);
    expect(metadata.keyHash).toBeUndefined();
    expect(metadata.customerId).toBe('cust_123');
    expect(metadata.name).toBe('My Key');
  });
});