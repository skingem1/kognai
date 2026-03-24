# SIGNAL — Event Bus and Pub/Sub for Agent Swarms


[![npm version](https://img.shields.io/npm/v/@godman-protocols/signal.svg)](https://www.npmjs.com/package/@godman-protocols/signal)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

> **v0.2.0** · Apache 2.0 · `@godman-protocols/signal` · Node 20+ / Deno 1.40+

SIGNAL is an open protocol for real-time event delivery between AI agents — with glob-based topic matching, idempotency deduplication, and delivery receipts, so your swarm stays coordinated without polling.

```bash
npx skills add https://github.com/godman-protocols/signal
# or
npm install @godman-protocols/signal
```

---

## The Problem

Multi-agent systems need to react to events: a mandate was signed, a task completed, a resource released. Without an event bus:

- **Polling everywhere** — agents waste cycles checking each other's state
- **Lost events** — no delivery guarantees means agents miss critical signals
- **Duplicate processing** — without idempotency, retries cause double execution

SIGNAL is the missing communication backbone for agent swarms.

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Event** | A signed, timestamped message on a dot-notation topic (e.g. `task.completed`) |
| **Subscription** | A registration to receive events matching a glob-style topic filter |
| **EventBus** | In-memory pub/sub engine with topic matching and delivery tracking |
| **DeliveryReceipt** | Confirmation that an event was delivered and processed (or failed) |
| **IdempotencyKey** | Deduplication key — same key = same event, skip re-delivery |

---

## Quickstart

```typescript
import { EventBus, createEvent } from '@godman-protocols/signal';

const bus = new EventBus();
const SECRET = process.env.SIGNAL_SECRET!;

// 1. Subscribe to task completion events
const delivered: string[] = [];
bus.subscribe('did:kognai:sherlock', 'task.*', (event) => {
  delivered.push(event.topic);
});

// 2. Publish an event
const event = createEvent(
  'did:kognai:messi',         // publisher
  'task.completed',            // topic
  { taskId: 'sprint-973-01' }, // payload
  SECRET
);

const receipts = await bus.publish(event);
// → [{ status: 'processed', ... }]

// 3. Idempotency — publishing the same event again is a no-op
const dupeReceipts = await bus.publish(event);
// → [{ status: 'duplicate-skipped', ... }]

// 4. Wildcard matching
bus.subscribe('did:kognai:guardiola', 'mandate.**', (event) => {
  // Matches: mandate.signed, mandate.revoked, mandate.frame.closed
});
```

---

## API Summary

### Event Creation (`src/bus.ts`)

| Function | Description |
|----------|-------------|
| `createEvent(publisher, topic, payload, secret, options?)` | Create a signed event |

### EventBus (`src/bus.ts`)

| Method | Description |
|--------|-------------|
| `subscribe(agent, topicFilter, handler, deliveryMode?)` | Subscribe to matching events |
| `unsubscribe(subscriptionId)` | Cancel a subscription |
| `publish(event)` | Deliver event to all matching subscribers |
| `getReceipts()` | Get all delivery receipts |
| `subscriptionCount` | Number of active subscriptions |

### Topic Matching (`src/bus.ts`)

| Function | Description |
|----------|-------------|
| `topicMatches(filter, topic)` | Test if a topic matches a glob filter |

### Singleton

| Export | Description |
|--------|-------------|
| `defaultBus` | Pre-created singleton EventBus for single-process use |

---

## Topic Matching Rules

Topics use dot notation: `task.completed`, `mandate.frame.closed`

Filters support two wildcards:
- **`*`** — matches exactly one segment: `task.*` matches `task.completed` but not `task.sub.completed`
- **`**`** — matches zero or more segments: `mandate.**` matches `mandate`, `mandate.signed`, `mandate.frame.closed`

---

## Delivery Modes

| Mode | Guarantee |
|------|-----------|
| `at-least-once` (default) | Event delivered at least once; handler may see retries |
| `at-most-once` | Event delivered at most once; may be lost on failure |

Idempotency deduplication applies regardless of delivery mode — duplicate events (same `idempotencyKey`) are always skipped.

---

## Security Model

SIGNAL v0.2 uses HMAC-SHA256 for event signing. The signature covers: event ID, topic, publisher, and timestamp.

**Production upgrade path:**
- Replace HMAC with Ed25519 for publisher identity verification
- Add Supabase Realtime or Redis Streams transport adapter
- Add WebSocket transport for cross-process delivery
- Persistent event log with replay capability

---

## Compatibility

| System | How it connects |
|--------|----------------|
| **Kognai** (event bus) | SIGNAL formalises the Supabase `kognai_events` table pattern |
| **PACT** (mandates) | Mandate lifecycle events: `mandate.signed`, `mandate.revoked`, `mandate.expired` |
| **SCORE** (evaluations) | Evaluation events: `score.evaluation.completed`, `score.reputation.updated` |
| **DRS** (resources) | Resource events: `resource.allocated`, `resource.released`, `resource.preempted` |

---

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| **PACT** | Agent coordination and trust |
| **LAX** | Latency-aware execution scheduling |
| **SCORE** | Scoring and reputation for agent outputs |
| **AMF** | Agent Message Format |
| **DRS** | Dynamic Resource Scheduling |
| **SOUL** | Constitutional constraints and safety |
| **SIGNAL** (this repo) | Event bus and pub/sub for agent swarms |

---

## Roadmap

- [x] Signed event creation (v0.2)
- [x] In-memory EventBus with glob topic matching (v0.2)
- [x] Idempotency deduplication (v0.2)
- [x] Delivery receipts with status tracking (v0.2)
- [ ] Supabase Realtime transport adapter (v0.3)
- [ ] Redis Streams transport adapter (v0.3)
- [ ] Event replay from persistent log (v0.4)
- [ ] Python SDK (v0.5)
- [ ] Cross-process WebSocket delivery (v0.5)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)

Part of the [Godman Protocols](https://github.com/godman-protocols) portfolio.
