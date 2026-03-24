/**
 * SIGNAL — Event Bus and Pub/Sub for Agent Swarms
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

export type AgentId = string;
export type Timestamp = string;
export type Signature = string;
export type EventId = string;
export type SubscriptionId = string;

/** A typed, timestamped, signed event */
export interface Event {
  id: EventId;
  /** Dot-notation topic path, e.g. 'task.completed', 'mandate.revoked' */
  topic: string;
  /** Publishing agent */
  publisher: AgentId;
  /** ISO 8601 */
  publishedAt: Timestamp;
  /** Idempotency key — deduplicate on re-delivery */
  idempotencyKey: string;
  payload: unknown;
  signature: Signature;
}

/** A durable subscription to a topic filter */
export interface Subscription {
  id: SubscriptionId;
  subscriberAgent: AgentId;
  /** Glob-style topic filter, e.g. 'task.*', '**' */
  topicFilter: string;
  /** Delivery guarantee */
  deliveryMode: 'at-least-once' | 'at-most-once';
  /** ISO 8601 */
  createdAt: Timestamp;
  /** ISO 8601 — null if still active */
  cancelledAt: Timestamp | null;
}

/** Transport adapter configuration */
export interface TransportConfig {
  type: 'supabase-realtime' | 'websocket' | 'redis-streams' | 'in-memory';
  connectionString?: string;
  channel?: string;
}

/** Delivery receipt — confirms an event was received and processed */
export interface DeliveryReceipt {
  eventId: EventId;
  subscriptionId: SubscriptionId;
  receivedAt: Timestamp;
  status: 'processed' | 'failed' | 'duplicate-skipped';
}
