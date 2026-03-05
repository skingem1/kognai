import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { registerWebhookSchema, webhookQuerySchema, webhookEventSchema } from '../webhook-schemas';

describe('registerWebhookSchema', () => {
  it('valid: minimal payload', () => {
    const result = registerWebhookSchema.safeParse({ url: 'https://example.com/webhook', events: ['invoice.created'] });
    expect(result.success).toBe(true);
  });

  it('valid: all fields', () => {
    const result = registerWebhookSchema.safeParse({ url: 'https://example.com/webhook', events: ['invoice.created'], secret: '1234567890123456', description: 'Test' });
    expect(result.success).toBe(true);
  });

  it('invalid: missing url', () => {
    const result = registerWebhookSchema.safeParse({ events: ['invoice.created'] });
    expect(result.success).toBe(false);
  });

  it('invalid: invalid url', () => {
    const result = registerWebhookSchema.safeParse({ url: 'not-a-url', events: ['invoice.created'] });
    expect(result.success).toBe(false);
  });

  it('invalid: empty events', () => {
    const result = registerWebhookSchema.safeParse({ url: 'https://example.com/webhook', events: [] });
    expect(result.success).toBe(false);
  });

  it('invalid: invalid event type', () => {
    const result = registerWebhookSchema.safeParse({ url: 'https://example.com/webhook', events: ['invalid.event'] });
    expect(result.success).toBe(false);
  });

  it('invalid: secret too short', () => {
    const result = registerWebhookSchema.safeParse({ url: 'https://example.com/webhook', events: ['invoice.created'], secret: '12345' });
    expect(result.success).toBe(false);
  });
});

describe('webhookQuerySchema', () => {
  it('valid: defaults', () => {
    const result = webhookQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(10);
  });

  it('valid: with status', () => {
    const result = webhookQuerySchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('invalid: invalid status', () => {
    const result = webhookQuerySchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });
});

describe('webhookEventSchema', () => {
  it('valid: full payload', () => {
    const result = webhookEventSchema.safeParse({ id: 'evt_1', type: 'invoice.created', data: { amount: 100 }, timestamp: '2026-01-01T00:00:00Z' });
    expect(result.success).toBe(true);
  });

  it('invalid: missing type', () => {
    const result = webhookEventSchema.safeParse({ id: 'evt_1', data: {}, timestamp: '2026-01-01T00:00:00Z' });
    expect(result.success).toBe(false);
  });

  it('invalid: invalid type', () => {
    const result = webhookEventSchema.safeParse({ id: 'evt_1', type: 'bad.event', data: {}, timestamp: '2026-01-01T00:00:00Z' });
    expect(result.success).toBe(false);
  });

  it('invalid: invalid timestamp', () => {
    const result = webhookEventSchema.safeParse({ id: 'evt_1', type: 'invoice.created', data: {}, timestamp: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});