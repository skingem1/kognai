---
name: godman-signal
description: "Use SIGNAL to publish and subscribe to events across agent swarms. SIGNAL provides an event bus with delivery receipts, transport config, and typed event schemas."
tags: ["pub-sub", "event-bus", "swarm", "messaging", "godman-protocols"]
version: "0.2.0"
---

# SIGNAL — Event Bus and Pub/Sub for Agent Swarms

Use this skill when agents need to communicate asynchronously, broadcast state changes, or react to events from other swarm members.

## Key Operations

```typescript
import { EventBus } from '@godman-protocols/signal';
import type { Event, Subscription, DeliveryReceipt } from '@godman-protocols/signal';

const bus = new EventBus({ transport: 'memory' }); // or 'supabase', 'redis'

// Publish an event
const receipt: DeliveryReceipt = await bus.publish({
  type: 'pipeline.step.completed', source: 'script-agent',
  payload: { step: 'generate', output_path: '/tmp/script.json' },
});

// Subscribe
const sub = bus.subscribe('pipeline.*', async (event: Event) => {
  console.log('Pipeline event:', event.type, event.payload);
});
```

## When to Use
- Coordinating parallel pipeline stages (SCS-001 pattern)
- Broadcasting kill switch events to all agents
- Collecting metrics from distributed swarm agents
- Triggering Telegram notifications on pipeline state changes
