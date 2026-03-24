/**
 * SIGNAL — Event Bus and Pub/Sub for Agent Swarms
 * Public API surface
 * @version 0.2.0
 */

// Types
export type {
  AgentId,
  Timestamp,
  Signature,
  EventId,
  SubscriptionId,
  Event,
  Subscription,
  TransportConfig,
  DeliveryReceipt,
} from './types.js';

// Event bus
export {
  EventBus,
  defaultBus,
  createEvent,
  topicMatches,
} from './bus.js';

/** Protocol version constant */
export const SIGNAL_VERSION = '0.2' as const;
