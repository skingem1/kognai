# AMF — Agent Message Format


[![npm version](https://img.shields.io/npm/v/@godman-protocols/amf.svg)](https://www.npmjs.com/package/@godman-protocols/amf)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

> **v0.2.0** · Apache 2.0 · `@godman-protocols/amf` · Node 20+ / Deno 1.40+

AMF is an open protocol for structured agent-to-agent messaging — a signed envelope format with typed payloads, so every message between agents is verifiable, routable, and machine-readable.

```bash
npx skills add https://github.com/godman-protocols/amf
# or
npm install @godman-protocols/amf
```

---

## The Problem

When agents communicate, messages are typically ad-hoc strings or unstructured JSON. This creates problems:

- **No verification** — you can't prove who sent a message
- **No schema** — every agent parses messages differently
- **No routing** — broadcast-only, no way to address specific agents

AMF is the missing wire format: a signed envelope with typed payloads (task requests, results, events, heartbeats, errors) that any agent can create, verify, and route.

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Envelope** | The outer container: sender, recipient, timestamp, signature, and typed payload |
| **Payload** | A discriminated union of 5 message types: task-request, task-result, event, heartbeat, error |
| **Signature** | HMAC-SHA256 over a SHA-256 hash of the canonical envelope fields |
| **Broadcast** | An envelope with `recipient: null` — delivered to all agents |

---

## Quickstart

```typescript
import {
  createEnvelope, verifyEnvelope,
  taskRequest, taskResult, event, heartbeat, error,
} from '@godman-protocols/amf';

const SECRET = process.env.AGENT_SECRET!;

// 1. Send a task request
const envelope = createEnvelope(
  'did:kognai:harvey',         // sender
  'did:kognai:messi',          // recipient
  taskRequest('task-001', 'Write pipeline validator', { files: ['pipeline.ts'] }),
  SECRET
);

// 2. Verify the envelope
const valid = verifyEnvelope(envelope, SECRET);
// → true

// 3. Send a task result back
const result = createEnvelope(
  'did:kognai:messi',
  'did:kognai:harvey',
  taskResult('task-001', 'success', { filesWritten: 1 }),
  SECRET
);

// 4. Broadcast a heartbeat to all agents
const hb = createEnvelope(
  'did:kognai:messi',
  null,  // broadcast
  heartbeat('alive', 0.3),
  SECRET
);

// 5. Payload builders for all 5 types
event('task.completed', { taskId: 'task-001' });
error('TIMEOUT', 'Task exceeded 5s budget', 'msg-123');
```

---

## API Summary

### Envelope (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `createEnvelope(sender, recipient, payload, secret, options?)` | Create and sign an envelope |
| `verifyEnvelope(envelope, senderSecret)` | Verify envelope signature |

### Payload Builders (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `taskRequest(taskId, description, input, deadline?)` | Build a task request payload |
| `taskResult(taskId, status, output, error?)` | Build a task result payload |
| `event(topic, data)` | Build an event payload |
| `heartbeat(status, load?)` | Build a heartbeat payload |
| `error(code, message, relatedMessageId?)` | Build an error payload |

---

## Payload Types

| Type | Fields | Use case |
|------|--------|----------|
| `task-request` | taskId, description, input, deadline? | Delegate work to another agent |
| `task-result` | taskId, status (success/failure/partial), output, error? | Report task outcome |
| `event` | topic, data | Notify about state changes |
| `heartbeat` | status (alive/degraded/shutting-down), load? | Health monitoring |
| `error` | code, message, relatedMessageId? | Report failures |

---

## Security Model

AMF v0.2 uses a two-layer signing scheme:
1. SHA-256 hash of canonical JSON (id, sender, recipient, sentAt, payload)
2. HMAC-SHA256 of the hash with the sender's secret

This prevents tampering with any envelope field including the payload.

**Production upgrade path:**
- Replace HMAC with Ed25519 for asymmetric sender verification
- Add encryption layer for sensitive payloads (NaCl box)
- Support binary payloads via content-addressed references

---

## Compatibility

| System | How it connects |
|--------|----------------|
| **Kognai** (swarm) | AMF envelopes replace ad-hoc JSON in agent-to-agent communication |
| **PACT** (mandates) | Mandate delegation carried as AMF task-request payloads |
| **SIGNAL** (events) | SIGNAL events can be wrapped in AMF envelopes for cross-runtime delivery |
| **LAX** (routing) | Routing decisions embedded as AMF envelope metadata |

---

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| **PACT** | Agent coordination and trust |
| **LAX** | Latency-aware execution scheduling |
| **SCORE** | Scoring and reputation for agent outputs |
| **AMF** (this repo) | Agent Message Format |
| **DRS** | Dynamic Resource Scheduling |
| **SOUL** | Constitutional constraints and safety |
| **SIGNAL** | Event bus and pub/sub for agent swarms |

---

## Roadmap

- [x] Envelope creation + HMAC-SHA256 signing (v0.2)
- [x] Envelope verification (v0.2)
- [x] 5 typed payload builders (v0.2)
- [ ] Ed25519 signing (v0.3)
- [ ] Encrypted payloads (NaCl box) (v0.3)
- [ ] Binary payload support (v0.4)
- [ ] Python SDK (v0.5)
- [ ] Cross-runtime envelope relay (v0.5)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)

Part of the [Godman Protocols](https://github.com/godman-protocols) portfolio.
