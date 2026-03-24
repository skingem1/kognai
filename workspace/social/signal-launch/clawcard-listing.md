# SIGNAL — ClaWHub Listing

**Name:** SIGNAL — Event Bus and Pub/Sub for Agent Swarms  
**Namespace:** `@godman-protocols/signal`  
**Version:** 0.2.0  
**License:** Apache 2.0  
**Tier:** T2 (infrastructure protocol)  
**Category:** Agent Infrastructure / Messaging  

## Short description (140 chars)
In-process pub/sub event bus for AI agent swarms. Topic-glob routing, idempotent delivery, delivery receipts.

## Full description
SIGNAL is an open protocol providing a standard event bus for multi-agent systems. Agents publish typed events to topic strings and subscribe via glob patterns — enabling loose coupling, reactive architectures, and event-driven coordination without polling or custom webhook infrastructure.

**Key features:**
- `new EventBus()` — stateful event bus (or use `defaultBus` singleton)
- `createEvent(topic, data, sender)` — create a typed, signed event
- `bus.subscribe(pattern, handler)` — glob-pattern topic subscriptions
- `bus.publish(event)` → `DeliveryReceipt` — confirmed delivery
- Idempotent: duplicate event IDs are silently dropped
- Works with AMF: SIGNAL events can be wrapped in AMF envelopes for transport

**Install:**
```bash
npx skills add https://github.com/godman-protocols/signal
```

## Tags
event-bus, pub-sub, messaging, agent-communication, idempotent, godman-protocols
