import { createApiKeySchema, apiKeyQuerySchema, rotateApiKeySchema } from '../api-key-schemas';

describe('createApiKeySchema', () => {
  it('validates valid input', () => {
    const result = createApiKeySchema.safeParse({ name: 'Test Key', expiresInDays: 30, scopes: ['invoices:read'] });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Test Key', expiresInDays: 30, scopes: ['invoices:read'] });
  });

  it('applies defaults for optional fields', () => {
    const result = createApiKeySchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
    expect(result.data?.scopes).toEqual([]);
    expect(result.data?.expiresInDays).toBeUndefined();
  });

  it('rejects empty name', () => {
    const result = createApiKeySchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts boundary name lengths (1 and 100 chars)', () => {
    const r1 = createApiKeySchema.safeParse({ name: 'a' });
    const r2 = createApiKeySchema.safeParse({ name: 'a'.repeat(100) });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('rejects name over 100 chars', () => {
    const result = createApiKeySchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts boundary expiresInDays (1 and 365)', () => {
    const r1 = createApiKeySchema.safeParse({ name: 'a', expiresInDays: 1 });
    const r2 = createApiKeySchema.safeParse({ name: 'a', expiresInDays: 365 });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('rejects invalid expiresInDays', () => {
    const r1 = createApiKeySchema.safeParse({ name: 'a', expiresInDays: -1 });
    const r2 = createApiKeySchema.safeParse({ name: 'a', expiresInDays: 366 });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });

  it('rejects invalid scopes', () => {
    const result = createApiKeySchema.safeParse({ name: 'a', scopes: ['invalid:scope'] });
    expect(result.success).toBe(false);
  });
});

describe('apiKeyQuerySchema', () => {
  it('applies defaults for limit and offset', () => {
    const result = apiKeyQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(20);
    expect(result.data?.offset).toBe(0);
  });

  it('coerces string limit and offset to numbers', () => {
    const result = apiKeyQuerySchema.safeParse({ limit: '10', offset: '5' });
    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(10);
    expect(result.data?.offset).toBe(5);
  });

  it('accepts valid status enum', () => {
    const result = apiKeyQuerySchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = apiKeyQuerySchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('rotateApiKeySchema', () => {
  it('validates valid expiresInDays', () => {
    const result = rotateApiKeySchema.safeParse({ expiresInDays: 30 });
    expect(result.success).toBe(true);
  });

  it('allows undefined expiresInDays', () => {
    const result = rotateApiKeySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects expiresInDays over 365', () => {
    const result = rotateApiKeySchema.safeParse({ expiresInDays: 366 });
    expect(result.success).toBe(false);
  });
});