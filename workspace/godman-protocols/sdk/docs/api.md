# @godman-protocols/sdk — API Reference

> Unified SDK for all 7 Godman Protocols. One install, full agent infrastructure.

```bash
npm install @godman-protocols/sdk
```

---

## Import Styles

### Flat imports (recommended for tree-shaking)

```typescript
import {
  createMandate, signMandate, verifyMandate,  // PACT
  createConstitution, evaluateAction,          // SOUL
  EventBus, createEvent,                       // SIGNAL
  createEnvelope, verifyEnvelope,              // AMF
  createBudget, routeTask,                     // LAX
  createRubric, evaluate,                      // SCORE
  ResourceScheduler,                           // DRS
} from '@godman-protocols/sdk';
```

### Namespaced imports (for clarity in large codebases)

```typescript
import { pact, soul, signal, amf, lax, score, drs } from '@godman-protocols/sdk';

const mandate = pact.createMandate({ ... });
const result = soul.evaluateAction(constitution, action);
```

---

## PACT — Protocol for Agent Coordination and Trust

### `createMandate(params)`

Create a signed cooperation mandate authorising an agent to act on behalf of another.

```typescript
const mandate = createMandate({
  issuer: 'agent-A',
  delegate: 'agent-B',
  scopes: ['task:write', 'data:read'],
  expiresAt: Date.now() + 3600_000,
  maxPaymentUSDC: 10,
});
```

### `signMandate(mandate, signerKey)`

Sign a mandate with the issuer's key. Returns the signed mandate.

### `verifyMandate(mandate)`

Verify mandate signature and expiry. Returns `{ valid, reason }`.

### `openFrame(params)` / `closeFrame(frameId)`

Open/close a `CoordinationFrame` grouping multiple mandates for a shared task.

### `MandateRegistry` / `defaultRegistry`

In-memory revocation ledger. Call `defaultRegistry.revoke(id)` to revoke a mandate.

---

## SOUL — Constitutional Constraints and Safety

### `createConstitution(params)`

Define the safety constitution for an agent swarm.

```typescript
const constitution = createConstitution({
  operator: 'kognai',
  constraints: [
    { id: 'no-self-replicate', action: 'deny', description: 'No self-replication' },
  ],
  killSwitches: [
    { id: 'cost-limit', condition: 'cost > 100', action: 'halt' },
  ],
});
```

### `signConstitution(constitution, operatorKey)`

Cryptographically sign the constitution. Must be signed before evaluation.

### `evaluateAction(constitution, action)`

Evaluate an agent action against the constitution. Returns `EvaluationResult`:
- `allowed: true` — action is permitted
- `allowed: false` — action is blocked (check `reason`)

### `checkKillSwitches(constitution, context)`

Check if any kill switch conditions are triggered.

---

## SIGNAL — Event Bus and Pub/Sub

### `EventBus` class / `defaultBus`

In-memory event bus for agent-to-agent pub/sub.

```typescript
const bus = new EventBus();

// Subscribe to all agent.* events
const sub = bus.subscribe('agent.*', async (event) => {
  console.log('received', event.topic, event.payload);
});

// Publish
await bus.publish(createEvent('agent.started', { agentId: 'A' }));

// Unsubscribe
bus.unsubscribe(sub.id);
```

### `createEvent(topic, payload)`

Create a typed, deduplicated event envelope with a unique `id`.

### `topicMatches(pattern, topic)`

Check if a glob pattern matches a topic string.

---

## AMF — Agent Message Format

### `createEnvelope(params)`

Create a signed message envelope for agent-to-agent communication.

```typescript
const envelope = createEnvelope({
  from: 'agent-A',
  to: 'agent-B',
  payload: taskRequest({ task: 'summarise', input: '...' }),
});
```

### `verifyEnvelope(envelope)`

Verify envelope integrity. Returns `{ valid, reason }`.

### Payload builders

| Function | Purpose |
|----------|---------|
| `taskRequest(params)` | Delegate a task |
| `taskResult(params)` | Return a task result |
| `event(params)` | Emit a domain event |
| `heartbeat(params)` | Send a liveness signal |
| `error(params)` | Signal an error |

---

## LAX — Latency-Aware Execution

### `createBudget(params)`

Define a latency budget for a task execution.

```typescript
const budget = createBudget({
  taskId: 'summarise-doc',
  maxLatencyMs: 2000,
  preferredSlot: 'cloud',
  fallbackSlot: 'local',
});
```

### `createProbe(slot, latencyMs)`

Record a latency measurement for a runtime slot.

### `routeTask(budget, probes)`

Route a task to the fastest slot within budget. Returns `RoutingDecision`.

### `registerSLA(params)` / `checkSLACompliance(slaId, latencyMs)`

Register SLA contracts and check compliance after execution.

---

## SCORE — Scoring and Reputation

### `createRubric(params)`

Define weighted scoring criteria for agent output quality.

```typescript
const rubric = createRubric({
  name: 'content-quality',
  criteria: [
    { id: 'accuracy', weight: 0.4, description: 'Factual accuracy' },
    { id: 'clarity', weight: 0.3, description: 'Clarity of expression' },
    { id: 'brevity', weight: 0.3, description: 'Appropriate length' },
  ],
});
```

### `evaluate(rubric, scores)`

Evaluate agent output against a rubric. Returns `Evaluation` with composite score.

### `calculateReputation(evaluations, decayFactor?)`

Calculate time-decayed reputation from a history of evaluations.

### `createAuditEntry(evaluation, agentId)`

Create a signed audit trail entry for an evaluation.

---

## DRS — Dynamic Resource Scheduling

### `ResourceScheduler` class / `defaultScheduler`

Manage resource pools and allocations.

```typescript
const scheduler = new ResourceScheduler();

// Register a pool
scheduler.registerPool({
  id: 'gpu-pool',
  name: 'GPU Cluster',
  capacity: { compute: 100, memory: 512, tokens: 1_000_000 },
  priority: 10,
});

// Allocate resources
const allocation = scheduler.allocate({
  agentId: 'agent-A',
  poolId: 'gpu-pool',
  requested: { compute: 20, memory: 64 },
  ttlMs: 30_000,
});

// Release
scheduler.release(allocation.id);
```

### `scheduler.preempt(allocationId, reason)`

Preempt an allocation for higher-priority work.

---

## Version Constants

```typescript
import {
  SDK_VERSION,   // '0.2.0'
  PACT_VERSION,
  LAX_VERSION,
  SCORE_VERSION,
  SIGNAL_VERSION,
  SOUL_VERSION,
  AMF_VERSION,
  DRS_VERSION,
} from '@godman-protocols/sdk';
```

---

## Full Agent Workflow Example

See [`examples/agent-workflow.ts`](../examples/) for a complete multi-agent scenario using all 7 protocols together.

---

*Generated for @godman-protocols/sdk v0.2.0 — Apache 2.0*
