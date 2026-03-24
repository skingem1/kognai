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

## Requirements

- Node.js >= 20.0.0
- Zero external dependencies (Node.js crypto only)

## License

Apache-2.0
