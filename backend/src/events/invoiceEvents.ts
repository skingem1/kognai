// Invoice event emitter — publishes domain events to Redis pub/sub
// If Redis is not configured, events are logged locally (no-op queue).
import { redis } from '../lib/redis';

export type InvoiceEventType =
  | invoice.created
  | invoice.updated
  | invoice.paid
  | invoice.settled
  | invoice.cancelled;

export interface InvoiceEventPayload {
  invoiceId: string;
  invoiceNumber?: number;
  amount?: number;
  currency?: string;
  customerId?: string;
  chain?: string;
  [key: string]: unknown;
}

/**
 * Emit an invoice domain event.
 * Publishes to Redis channel "invoice-events" if Redis is available,
 * otherwise logs locally (graceful degradation).
 */
export async function createInvoiceEvent(
  eventType: InvoiceEventType | string,
  payload: InvoiceEventPayload
): Promise<void> {
  const event = {
    type: eventType,
    payload,
    timestamp: new Date().toISOString(),
  };

  try {
    await redis.publish(invoice-events, JSON.stringify(event));
  } catch {
    // Redis not configured or unavailable — log locally and continue
    console.log(`[InvoiceEvent] ${eventType}`, JSON.stringify(payload));
  }
}
