# SIGNAL API Reference

> **v0.2.0** · Full API surface for `@godman-protocols/signal`

---

## Types

### `AgentId`
```typescript
type AgentId = string;
```
A unique agent identifier — DID, x402 wallet address, or scoped handle.

### `Timestamp`
```typescript
type Timestamp = string;
```
ISO 8601 timestamp string.

### `Signature`
```typescript
type Signature = string;
```
Hex-encoded HMAC-SHA256 signature.

### `EventId`
```typescript
type EventId = string;
```

### `SubscriptionId`
```typescript
type SubscriptionId = string;
```

### `Event`
```typescript
interface Event {
  id: EventId;
  topic: string;
  publisher: AgentId;
  publishedAt: Timestamp;
  idempotencyKey: string;
  payload: unknown;
  signature: Signature;
}
```
`topic` uses dot notation (e.g. `task.completed`, `mandate.frame.closed`). `idempotencyKey` defaults to the event ID if not specified.

### `Subscription`
```typescript
interface Subscription {
  id: SubscriptionId;
  subscriberAgent: AgentId;
  topicFilter: string;
  deliveryMode: 'at-least-once' | 'at-most-once';
  createdAt: Timestamp;
  cancelledAt: Timestamp | null;
}
```
`topicFilter` supports glob wildcards: `*` (one segment), `**` (zero or more segments).

### `TransportConfig`
```typescript
interface TransportConfig {
  type: 'supabase-realtime' | 'websocket' | 'redis-streams' | 'in-memory';
  connectionString?: string;
  channel?: string;
}
```
Reserved for v0.3 transport adapters. Currently only `in-memory` is implemented.

### `DeliveryReceipt`
```typescript
interface DeliveryReceipt {
  eventId: EventId;
  subscriptionId: SubscriptionId;
  receivedAt: Timestamp;
  status: 'processed' | 'failed' | 'duplicate-skipped';
}
```

---

## Event Creation (`src/bus.ts`)

### `createEvent(publisher, topic, payload, secret, options?)`

Create a signed event.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `publisher` | `AgentId` | — | Agent publishing the event |
| `topic` | `string` | — | Dot-notation topic path |
| `payload` | `unknown` | — | Event payload (any serialisable value) |
| `secret` | `string` | — | Secret for HMAC-SHA256 signing |
| `options.id` | `string` | auto UUID | Override event ID |
| `options.idempotencyKey` | `string` | event ID | Deduplication key |
| `options.publishedAt` | `Timestamp` | now | Override timestamp |

**Returns:** `Event`

**Signature covers:** `${id}:${topic}:${publisher}:${publishedAt}`

---

## Topic Matching (`src/bus.ts`)

### `topicMatches(filter, topic)`

Test if a topic matches a glob-style filter.

| Param | Type | Description |
|-------|------|-------------|
| `filter` | `string` | Glob filter (e.g. `task.*`, `mandate.**`) |
| `topic` | `string` | Concrete topic (e.g. `task.completed`) |

**Returns:** `boolean`

**Wildcards:**
- `*` — matches exactly one segment: `task.*` matches `task.completed` but not `task.sub.completed`
- `**` — matches zero or more segments: `mandate.**` matches `mandate`, `mandate.signed`, `mandate.frame.closed`

---

## EventBus (`src/bus.ts`)

### `class EventBus`

In-memory pub/sub engine with topic matching, idempotency deduplication, and delivery receipts.

### `subscribe(subscriberAgent, topicFilter, handler, deliveryMode?)`

Subscribe to events matching a topic filter.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `subscriberAgent` | `AgentId` | — | Agent subscribing |
| `topicFilter` | `string` | — | Glob-style topic filter |
| `handler` | `(event: Event) => void \| Promise<void>` | — | Event handler |
| `deliveryMode` | `'at-least-once' \| 'at-most-once'` | `'at-least-once'` | Delivery guarantee |

**Returns:** `Subscription`

### `unsubscribe(subscriptionId)`

Cancel a subscription. Marks it as cancelled with a timestamp.

| Param | Type | Description |
|-------|------|-------------|
| `subscriptionId` | `SubscriptionId` | Subscription to cancel |

**Throws:** If subscription ID not found.

### `publish(event)`

Deliver event to all matching subscribers. Deduplicates by `idempotencyKey`.

| Param | Type | Description |
|-------|------|-------------|
| `event` | `Event` | Event to publish |

**Returns:** `Promise<DeliveryReceipt[]>`

If the event's `idempotencyKey` was already seen, returns a single receipt with `status: 'duplicate-skipped'`. Otherwise, delivers to all matching subscribers and returns one receipt per delivery.

Handler exceptions result in `status: 'failed'` receipts (event is still delivered to other subscribers).

### `getReceipts()`

Get all delivery receipts (cumulative across all publishes).

**Returns:** `ReadonlyArray<DeliveryReceipt>`

### `subscriptionCount` (getter)

Number of active subscriptions.

**Returns:** `number`

### `defaultBus`

Pre-created singleton `EventBus` for single-process use.

```typescript
import { defaultBus } from '@godman-protocols/signal';
```

---

## Constants

```typescript
const SIGNAL_VERSION: '0.2';
```
