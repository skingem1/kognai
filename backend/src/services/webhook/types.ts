import { z } from 'zod';
import { PrismaClient, WebhookRegistration as PrismaWebhookRegistration } from '@prisma/client';

// Re-export Prisma type for use in other modules
export type WebhookRegistration = PrismaWebhookRegistration;

export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface DispatchResult {
  success: boolean;
  statusCode: number;
  retryable: boolean;
}

// Validation schema for registration input
export const registerSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(16).max(256),
});

/**
 * Webhook repository — Prisma-backed storage (replaces in-memory Map).
 * All webhook registrations are persisted to PostgreSQL.
 */
export class WebhookRepository {
  constructor(private prisma: PrismaClient) {}

  async register(url: string, events: string[], secret: string): Promise<WebhookRegistration> {
    const parsed = registerSchema.parse({ url, events, secret });
    return this.prisma.webhookRegistration.create({
      data: {
        url: parsed.url,
        events: parsed.events,
        secret: parsed.secret,
      },
    });
  }

  async findById(id: string): Promise<WebhookRegistration | null> {
    return this.prisma.webhookRegistration.findUnique({ where: { id } });
  }

  async findActive(): Promise<WebhookRegistration[]> {
    return this.prisma.webhookRegistration.findMany({ where: { isActive: true } });
  }

  async deactivate(id: string): Promise<WebhookRegistration> {
    return this.prisma.webhookRegistration.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.webhookRegistration.delete({ where: { id } });
  }

  async listAll(): Promise<WebhookRegistration[]> {
    return this.prisma.webhookRegistration.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
