import { WEBHOOK_EVENTS, createWebhookEvent } from '../../../src/services/webhook/events';

describe('webhook events', () => {
  it('creates event with all required properties', () => {
    const event = createWebhookEvent(WEBHOOK_EVENTS.INVOICE_CREATED, { amount: 100 });
    
    expect(event.id).toBeDefined();
    expect(event.type).toBe('invoice.created');
    expect(event.data).toEqual({ amount: 100 });
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('generates unique ids for each event', () => {
    const event1 = createWebhookEvent(WEBHOOK_EVENTS.INVOICE_PAID, {});
    const event2 = createWebhookEvent(WEBHOOK_EVENTS.INVOICE_PAID, {});
    
    expect(event1.id).not.toBe(event2.id);
  });

  it('handles empty data object', () => {
    const event = createWebhookEvent(WEBHOOK_EVENTS.SETTLEMENT_CONFIRMED, {});
    
    expect(event.data).toEqual({});
    expect(event.type).toBe('settlement.confirmed');
  });

  it('exports correct event type constants', () => {
    expect(WEBHOOK_EVENTS.INVOICE_CREATED).toBe('invoice.created');
    expect(WEBHOOK_EVENTS.INVOICE_PAID).toBe('invoice.paid');
    expect(WEBHOOK_EVENTS.INVOICE_SETTLED).toBe('invoice.settled');
    expect(WEBHOOK_EVENTS.INVOICE_FAILED).toBe('invoice.failed');
    expect(WEBHOOK_EVENTS.SETTLEMENT_CONFIRMED).toBe('settlement.confirmed');
    expect(WEBHOOK_EVENTS.SETTLEMENT_FAILED).toBe('settlement.failed');
  });
});