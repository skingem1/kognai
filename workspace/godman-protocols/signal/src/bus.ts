/**
 * SIGNAL — Event Bus and Pub/Sub for Agent Swarms
 * In-memory EventBus implementation
 * @version 0.2.0
 */

import { createHmac, randomUUID } from 'node:crypto';
import type {
  AgentId,
  DeliveryReceipt,
  Event,
  Subscription,
  SubscriptionId,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Topic matching
// ---------------------------------------------------------------------------

/**
 * Match a topic against a glob-style filter.
 * - `*` matches exactly one segment
 * - `**` matches zero or more segments
 * - Exact strings match literally
 */
export function topicMatches(filter: string, topic: string): boolean {
  const filterParts = filter.split('.');
  const topicParts = topic.split('.');
  return matchParts(filterParts, 0, topicParts, 0);
}

function matchParts(f: string[], fi: number, t: string[], ti: number): boolean {
  if (fi === f.length && ti === t.length) return true;
  if (fi === f.length) return false;
  if (f[fi] === '**') {
    // ** can match zero or more segments
    for (let i = ti; i <= t.length; i++) {
      if (matchParts(f, fi + 1, t, i)) return true;
    }
    return false;
  }
  if (ti === t.length) return false;
  if (f[fi] === '*' || f[fi] === t[ti]) {
    return matchParts(f, fi + 1, t, ti + 1);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

/**
 * Create a signed event.
 */
export function createEvent(
  publisher: AgentId,
  topic: string,
  payload: unknown,
  secret: string,
  options: { id?: string; idempotencyKey?: string; publishedAt?: Timestamp } = {}
): Event {
  const id = options.id ?? randomUUID();
  const publishedAt = options.publishedAt ?? new Date().toISOString();
  const idempotencyKey = options.idempotencyKey ?? id;
  const sigPayload = `${id}:${topic}:${publisher}:${publishedAt}`;
  const signature = createHmac('sha256', secret).update(sigPayload, 'utf8').digest('hex');
  return { id, topic, publisher, publishedAt, idempotencyKey, payload, signature };
}

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

type EventHandler = (event: Event) => void | Promise<void>;

interface InternalSub {
  subscription: Subscription;
  handler: EventHandler;
}

export class EventBus {
  private subs = new Map<SubscriptionId, InternalSub>();
  private seenIdempotencyKeys = new Set<string>();
  private receipts: DeliveryReceipt[] = [];

  /**
   * Subscribe to events matching a topic filter.
   */
  subscribe(
    subscriberAgent: AgentId,
    topicFilter: string,
    handler: EventHandler,
    deliveryMode: 'at-least-once' | 'at-most-once' = 'at-least-once'
  ): Subscription {
    const sub: Subscription = {
      id: randomUUID(),
      subscriberAgent,
      topicFilter,
      deliveryMode,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    };
    this.subs.set(sub.id, { subscription: sub, handler });
    return sub;
  }

  /**
   * Unsubscribe. Marks the subscription as cancelled.
   */
  unsubscribe(subscriptionId: SubscriptionId): void {
    const entry = this.subs.get(subscriptionId);
    if (!entry) throw new Error(`Subscription ${subscriptionId} not found`);
    entry.subscription.cancelledAt = new Date().toISOString();
    this.subs.delete(subscriptionId);
  }

  /**
   * Publish an event to all matching subscribers.
   * Deduplicates by idempotencyKey.
   * Returns delivery receipts.
   */
  async publish(event: Event): Promise<DeliveryReceipt[]> {
    // Idempotency check
    if (this.seenIdempotencyKeys.has(event.idempotencyKey)) {
      const receipt: DeliveryReceipt = {
        eventId: event.id,
        subscriptionId: 'none',
        receivedAt: new Date().toISOString(),
        status: 'duplicate-skipped',
      };
      this.receipts.push(receipt);
      return [receipt];
    }
    this.seenIdempotencyKeys.add(event.idempotencyKey);

    const newReceipts: DeliveryReceipt[] = [];

    for (const [, entry] of this.subs) {
      if (entry.subscription.cancelledAt) continue;
      if (!topicMatches(entry.subscription.topicFilter, event.topic)) continue;

      let status: DeliveryReceipt['status'] = 'processed';
      try {
        await entry.handler(event);
      } catch {
        status = 'failed';
      }

      const receipt: DeliveryReceipt = {
        eventId: event.id,
        subscriptionId: entry.subscription.id,
        receivedAt: new Date().toISOString(),
        status,
      };
      newReceipts.push(receipt);
    }

    this.receipts.push(...newReceipts);
    return newReceipts;
  }

  /**
   * Get all delivery receipts.
   */
  getReceipts(): ReadonlyArray<DeliveryReceipt> {
    return [...this.receipts];
  }

  /**
   * Get active subscription count.
   */
  get subscriptionCount(): number {
    return this.subs.size;
  }
}

/** Default singleton bus for single-process use */
export const defaultBus = new EventBus();
