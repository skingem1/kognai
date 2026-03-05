import { WEBHOOK_EVENTS, createWebhookEvent } from '../events';

describe('webhook/events', () => {
  it('WEBHOOK_EVENTS has 6 keys', () => {
    expect(Object.keys(WEBHOOK_EVENTS).length).toBe(6);
  });

  it('WEBHOOK_EVENTS.INVOICE_CREATED equals invoice.created', () => {
    expect(WEBHOOK_EVENTS.INVOICE_CREATED).toBe('invoice.created');
  });

  it('createWebhookEvent returns object with id, type, data, createdAt', () => {
    const data = { invoiceId: 'inv_123', amount: 5000 };
    const event = createWebhookEvent(WEBHOOK_EVENTS.INVOICE_CREATED, data);
    expect(event).toHaveProperty('id');
    expect(event.type).toBe(WEBHOOK_EVENTS.INVOICE_CREATED);
    expect(event.data).toEqual(data);
    expect(event).toHaveProperty('createdAt');
  });

  it('createWebhookEvent id is a valid UUID', () => {
    const event = createWebhookEvent('invoice.created', {});
    expect(event.id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('createWebhookEvent createdAt is ISO string', () => {
    const event = createWebhookEvent('invoice.created', {});
    expect(new Date(event.createdAt).toISOString()).toBe(event.createdAt);
  });
});