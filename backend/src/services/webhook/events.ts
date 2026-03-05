import crypto from 'crypto';
import { WebhookEvent } from './types';

export const WEBHOOK_EVENTS = {
  INVOICE_CREATED: 'invoice.created',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_SETTLED: 'invoice.settled',
  INVOICE_FAILED: 'invoice.failed',
  SETTLEMENT_CONFIRMED: 'settlement.confirmed',
  SETTLEMENT_FAILED: 'settlement.failed',
} as const;

export function createWebhookEvent(type: string, data: unknown): WebhookEvent {
  return {
    id: crypto.randomUUID(),
    type,
    data,
    createdAt: new Date().toISOString(),
  };
}