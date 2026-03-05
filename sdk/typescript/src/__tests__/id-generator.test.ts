import { generateId, generateApiKey, generateIdempotencyKey, isValidId, extractTimestamp } from '../id-generator';

describe('id-generator', () => {
  it('generateId returns string with underscore separator', () => {
    expect(generateId()).toMatch(/^[0-9]+_[a-f0-9]+$/);
  });

  it('generateId with prefix starts with that prefix', () => {
    expect(generateId('inv_').startsWith('inv_')).toBe(true);
  });

  it('generateId without prefix has no prefix before hex', () => {
    const id = generateId();
    expect(id.startsWith('inv_') || id.startsWith('pay_')).toBe(false);
  });

  it('generateApiKey returns 40-char hex string', () => {
    expect(generateApiKey()).toMatch(/^[a-f0-9]{40}$/);
  });

  it('generateApiKey returns different values each call', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });

  it('generateIdempotencyKey returns UUID v4 format', () => {
    expect(generateIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('isValidId returns true for valid ID', () => {
    expect(isValidId(generateId())).toBe(true);
  });

  it('isValidId with prefix', () => {
    expect(isValidId(generateId('inv_'), 'inv_')).toBe(true);
  });

  it('isValidId returns false for empty string', () => {
    expect(isValidId('')).toBe(false);
  });

  it('isValidId returns false for wrong prefix', () => {
    expect(isValidId(generateId('inv_'), 'pay_')).toBe(false);
  });

  it('extractTimestamp returns number for valid ID', () => {
    expect(typeof extractTimestamp(generateId())).toBe('number');
  });

  it('extractTimestamp with prefix strips prefix correctly', () => {
    const id = generateId('inv_');
    const ts = extractTimestamp(id, 'inv_');
    expect(typeof ts).toBe('number');
  });

  it('extractTimestamp returns null for invalid ID', () => {
    expect(extractTimestamp('invalid')).toBeNull();
  });
});