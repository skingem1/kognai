# SIGNAL — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

Your agents poll each other's state in an infinite loop. Events get lost. Duplicate work everywhere.

We just open-sourced the missing event backbone.

SIGNAL — Event Bus for Agent Swarms. Thread:

---

## Tweet 2 — The problem

Multi-agent systems need to react to events: a mandate was signed, a task completed, a resource released.

Without an event bus, you get: polling everywhere, lost signals, and duplicate execution on retries.

---

## Tweet 3 — What SIGNAL does

SIGNAL is in-memory pub/sub with glob topic matching.

Subscribe to `task.*` — you get `task.completed` and `task.failed`. Subscribe to `mandate.**` — you get everything under mandates, any depth.

Idempotency dedup. Delivery receipts. Zero polling.

---

## Tweet 4 — The code

```typescript
const bus = new EventBus();
bus.subscribe(agent, 'task.*', handler);

const event = createEvent(publisher, 'task.completed', payload, SECRET);
await bus.publish(event);
// → [{ status: 'processed' }]

await bus.publish(event); // same idempotencyKey
// → [{ status: 'duplicate-skipped' }]
```

---

## Tweet 5 — Composability

SIGNAL connects the entire Godman stack:

→ PACT events: mandate.signed, mandate.revoked
→ SCORE events: score.evaluation.completed
→ DRS events: resource.allocated, resource.preempted
→ SOUL events: soul.killswitch.triggered

One bus. All protocols. Zero polling.

---

## Tweet 6 — CTA

SIGNAL is protocol 7 of 7 from Godman Protocols.

In-memory today. Supabase Realtime and Redis Streams transport adapters coming in v0.3.

GitHub: github.com/godman-protocols/signal
All 7 ship April 14.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 192 | ✓ |
| 2 | 213 | ✓ |
| 3 | 244 | ✓ |
| 4 | 237 | ✓ |
| 5 | 238 | ✓ |
| 6 | 190 | ✓ |

## Notes
- Tweet 4 code renders as plain text on X — consider image.
- Post April 14, final thread of the day.
