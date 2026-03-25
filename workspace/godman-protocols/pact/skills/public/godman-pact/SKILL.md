---
name: godman-pact
description: "Use the PACT protocol to create, sign, verify, and coordinate agent mandates. PACT enables trust contracts between AI agents with scoped permissions and TTL-based expiry."
tags: ["agent-coordination", "trust", "mandate", "godman-protocols"]
version: "0.2.0"
---

# PACT — Protocol for Agent Coordination and Trust

Use this skill when you need to delegate scoped permissions between agents, create tamper-evident mandates, or coordinate multi-agent workflows with trust anchors.

## Key Operations

```typescript
import { createMandate, signMandate, verifyMandate, scopeCovers, CoordinationFrame } from '@godman-protocols/pact';

// Create a mandate
const mandate = createMandate({ issuer, scope: ['read', 'write'], ttl: 3600, payment: { usdc: 0.01 } });

// Sign and verify
const signed = signMandate(mandate, privateKey);
const valid = verifyMandate(signed, publicKey); // checks signature, TTL, revocation

// Multi-agent coordination
const frame = new CoordinationFrame(frameId, [agentA, agentB]);
frame.open(); frame.addParticipant(agentC); frame.close(outcome);
```

## When to Use
- Delegating sub-agent permissions with expiry
- Creating payment-gated tool calls (x402 pattern)
- Coordinating swarm workflows with trust anchors
- Revoking permissions mid-session

## Notes
- SOUL constraints override PACT mandates — never use PACT to bypass safety rules
- Mandates are HMAC-SHA256 signed — store privateKey in vault, never in code
