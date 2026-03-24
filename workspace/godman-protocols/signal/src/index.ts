/**
 * SIGNAL — Event Bus and Pub/Sub for Agent Swarms
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 */

export type {
  AgentId, Timestamp, Signature, EventId, SubscriptionId,
  Event, Subscription, TransportConfig, DeliveryReceipt,
} from './types.js';

export const SIGNAL_VERSION = '0.1' as const;

export function publish(
  _publisher: string,
  _topic: string,
  _payload: unknown,
): import('./types.js').Event {
  throw new Error('SIGNAL publish: not implemented — skeleton phase');
}

export function subscribe(
  _agentId: string,
  _topicFilter: string,
  _handler: (event: import('./types.js').Event) => void,
): import('./types.js').Subscription {
  throw new Error('SIGNAL subscribe: not implemented — skeleton phase');
}

export function unsubscribe(_subscriptionId: string): void {
  throw new Error('SIGNAL unsubscribe: not implemented — skeleton phase');
}
