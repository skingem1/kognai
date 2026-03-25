---
name: godman-amf
description: "Use AMF to create, route, and parse structured envelopes between agents. AMF defines a standard message format (task requests, results, events, heartbeats, errors) for interoperable agent communication."
tags: ["messaging", "envelope", "interop", "agent-communication", "godman-protocols"]
version: "0.2.0"
---

# AMF — Agent Message Format

Use this skill when you need to pass structured messages between agents with type safety, signatures, and routing metadata.

## Key Operations

```typescript
import { createEnvelope, parseEnvelope, signEnvelope, routeEnvelope } from '@godman-protocols/amf';
import type { TaskRequestPayload, TaskResultPayload, ErrorPayload } from '@godman-protocols/amf';

// Send a task request
const envelope = createEnvelope({
  from: 'orchestrator', to: 'coder',
  payload_type: 'task_request',
  payload: { task: 'implement feature', context } as TaskRequestPayload,
});
const signed = signEnvelope(envelope, privateKey);

// Parse incoming message
const { payload_type, payload } = parseEnvelope(rawMessage);
```

## When to Use
- Building interoperable agent pipelines (DeerFlow ↔ OpenClaw ↔ Claude)
- Standardizing agent I/O for logging and replay
- Routing messages in a pub/sub swarm (combine with SIGNAL)
