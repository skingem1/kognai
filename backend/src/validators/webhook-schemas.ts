import { z } from 'zod';

const WEBHOOK_EVENTS = ['invoice.created', 'invoice.updated', 'invoice.paid', 'settlement.created', 'settlement.confirmed'] as const;

export const registerWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  secret: z.string().min(16).max(64).optional(),
  description: z.string().max(200).optional(),
});

export const webhookQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive']).optional(),
});

export const webhookEventSchema = z.object({
  id: z.string(),
  type: z.enum(WEBHOOK_EVENTS),
  data: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export type RegisterWebhookInput = z.infer<typeof registerWebhookSchema>;
export type WebhookQuery = z.infer<typeof webhookQuerySchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;