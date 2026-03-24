# @godman-protocols/sdk

Unified SDK for all 7 Godman Protocols. One install, full agent infrastructure.

## Install

```bash
npm install @godman-protocols/sdk
```

## Quick Start

```typescript
import {
  createMandate, signMandate, verifyMandate,  // PACT — coordination
  createConstitution, evaluateAction,          // SOUL — safety
  EventBus, createEvent,                       // SIGNAL — pub/sub
  createEnvelope, verifyEnvelope,              // AMF — messaging
  createBudget, routeTask,                     // LAX — latency
  createRubric, evaluate,                      // SCORE — reputation
  ResourceScheduler,                           // DRS — resources
} from '@godman-protocols/sdk';
```

Or use namespaced imports:

```typescript
import { pact, soul, signal, amf, lax, score, drs } from '@godman-protocols/sdk';

const mandate = pact.createMandate({ ... });
const result = soul.evaluateAction(constitution, 'deploy');
```

## Protocols

| Protocol | Purpose | Key Functions |
|----------|---------|---------------|
| **PACT** | Agent coordination & trust | `createMandate`, `signMandate`, `verifyMandate`, `openFrame` |
| **SOUL** | Constitutional constraints & safety | `createConstitution`, `evaluateAction`, `checkKillSwitches` |
| **SIGNAL** | Event bus & pub/sub | `EventBus`, `createEvent`, `topicMatches` |
| **AMF** | Agent message format | `createEnvelope`, `verifyEnvelope`, `taskRequest` |
| **LAX** | Latency-aware execution | `createBudget`, `routeTask`, `registerSLA` |
| **SCORE** | Scoring & reputation | `createRubric`, `evaluate`, `calculateReputation` |
| **DRS** | Dynamic resource scheduling | `ResourceScheduler`, `defaultScheduler` |

## Complete Example

See [`examples/agent-workflow.ts`](examples/agent-workflow.ts) for a full agent task flow using all 7 protocols:
SOUL → PACT → AMF → DRS → LAX → SIGNAL → SCORE.

Run it locally:

```bash
npx tsx examples/agent-workflow.ts
```

Expected output:

```
=== Godman Protocols — Agent Workflow Demo ===

1. SOUL: Constitutional safety check
   Constitution signed: agent:orchestrator
   Action "generate_code": ALLOWED — Allowed by constraint 'Allow code gen'
   Kill switches: clear

2. PACT: Mandate and coordination
   Frame opened: d108cc39-e42... (3 participants)
   Mandate: b868ee87-143... verified=true

3. AMF: Agent messaging
   Envelope: b38c2364-7af... from=agent:orchestrator verified=true

4. DRS: Resource allocation
   GPU allocated: fd278fd5-2c9...
   Model slot allocated: 077aee49-c0d...

5. LAX: Latency-aware routing
   SLA registered: bffa6ff3-972... (max 10000ms)
   Routed to: mac-mini-m4 (3000ms) — within_target

6. SIGNAL: Event broadcasting
   Events delivered: task.started, task.completed

7. SCORE: Result evaluation
   Score: 90.5%
   Reputation: 90.5% (1 eval)

=== Workflow Complete ===
Frame: closed
Resources: released
Score: 90.5%
Events: 2 delivered
Result: a98650a4-798...
```

## Requirements

- Node.js >= 20.0.0
- Zero external dependencies (Node.js crypto only)

## License

Apache-2.0
