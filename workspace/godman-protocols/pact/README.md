# PACT — Protocol for Agent Coordination and Trust


[![npm version](https://img.shields.io/npm/v/@godman-protocols/pact.svg)](https://www.npmjs.com/package/@godman-protocols/pact)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

> **v0.2.0** · Apache 2.0 · `@godman-protocols/pact` · Node 20+ / Deno 1.40+

PACT is an open protocol for autonomous AI agents to establish **verifiable cooperation agreements**, delegate authority with scoped mandates, and coordinate safely across heterogeneous runtimes — without a human in the loop.

```bash
npx skills add https://github.com/godman-protocols/pact
# or
npm install @godman-protocols/pact
```

---

## The Problem

Every multi-agent system eventually hits the same wall: one agent needs to ask another to do something, and there's no standard, verifiable way to say "yes, this agent is authorised to make that request."

Without a trust protocol, you get one of two failure modes:
- **Too permissive** — agents trust each other implicitly, and a single compromised agent can cascade
- **Too restrictive** — every inter-agent call requires a human approval, defeating the purpose of automation

PACT is the missing coordination layer.

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Mandate** | A signed, scoped delegation from one agent (grantor) to another (grantee) |
| **MandateScope** | What the grantee may do: actions, resources, max payment |
| **CoordinationFrame** | A shared execution context grouping agents and their active mandates |
| **MandateRegistry** | In-memory (or persistent) store for mandates and revocations |
| **RevocationEntry** | Append-only record invalidating a specific mandate |
| **TrustAnchor** | A verifiable root of authority (DID, x402 wallet, or org key) |

---

## Quickstart

```typescript
import {
  createMandate, signMandate, verifyMandate,
  openFrame, addParticipant, closeFrame,
  MandateRegistry, scopeCovers,
} from '@godman-protocols/pact';

// 1. Define what Harvey authorises Messi to do
const mandate = createMandate(
  'did:kognai:harvey',   // grantor
  'did:kognai:messi',   // grantee
  {
    description: 'Messi may read and write SCS-001 workspace',
    actions: ['read', 'write'],
    resources: ['workspace/scs001/*'],
    maxPaymentUsdc: 5.00,
  },
  { expiresAt: new Date(Date.now() + 86_400_000).toISOString() } // 24h
);

// 2. Harvey signs it with his secret (replace with EIP-712 / Ed25519 in prod)
const HARVEY_SECRET = process.env.HARVEY_SIGNING_KEY!;
const signed = signMandate(mandate, HARVEY_SECRET);

// 3. Messi verifies it before acting
const registry = new MandateRegistry();
registry.store(signed);

const result = verifyMandate(signed, HARVEY_SECRET, registry.revocationLedger);
// → { valid: true }

// 4. Check scope before executing
if (scopeCovers(signed, 'write', 'workspace/scs001/pipeline.json')) {
  // safe to proceed
}

// 5. Coordinate multiple agents in a frame
let frame = openFrame('did:kognai:harvey', [signed.id]);
frame = addParticipant(frame, 'did:kognai:sherlock');
// ... agents work ...
frame = closeFrame(frame); // frame.status === 'closed'
```

---

## API Summary

### Mandate lifecycle (`src/core.ts`)

| Function | Description |
|----------|-------------|
| `createMandate(grantor, grantee, scope, options?)` | Create an unsigned mandate skeleton |
| `hashMandate(mandate)` | SHA-256 hash over signable fields (deterministic) |
| `signMandate(mandate, secret)` | Attach HMAC-SHA256 signature |
| `revokeMandate(mandateId, revokedBy, secret, reason?)` | Create a RevocationEntry |

### Verification (`src/verifier.ts`)

| Function | Description |
|----------|-------------|
| `verifyMandate(mandate, secret, ledger?, asOf?)` | Check signature, expiry, and revocation |
| `scopeCovers(mandate, action, resource)` | Test if scope permits action on resource |
| `paymentAllowed(mandate, amountUsdc)` | Test if payment amount is within scope |

### Coordination frames (`src/coordinator.ts`)

| Function | Description |
|----------|-------------|
| `openFrame(initiator, mandateIds?, options?)` | Open a new CoordinationFrame |
| `addParticipant(frame, agentId)` | Add a participant (idempotent) |
| `addMandateToFrame(frame, mandateId)` | Add a mandate to the frame (idempotent) |
| `closeFrame(frame)` | Mark frame as closed (success) |
| `abortFrame(frame)` | Mark frame as aborted (constitutional violation or error) |

### Registry (`src/registry.ts`)

| Class / export | Description |
|----------------|-------------|
| `MandateRegistry` | In-memory store with `store`, `get`, `list`, `addRevocation`, `isRevoked`, `snapshot` |
| `defaultRegistry` | Singleton registry for single-process use |

---

## Security Model

PACT v0.2 uses HMAC-SHA256 for mandate signing. This is appropriate for:
- Single-organisation deployments where the grantor controls the secret
- Development and prototyping
- Systems where secrets are managed by a vault (e.g. AMD-24 sovereign vault)

**Production upgrade path:**
- Replace HMAC with Ed25519 (deterministic, asymmetric, standard)
- Use EIP-712 typed data for EVM-compatible identity (ERC-8004)
- Store mandates in a content-addressed ledger (IPFS or Supabase)
- Anchor revocations on-chain for cross-organisation trust

---

## Compatibility

PACT is the client-side trust layer that works with:

| System | How it connects |
|--------|----------------|
| **Clawcard** (ERC-8004 identity) | Clawcard agents pass PACT Chamber 2 automatically |
| **Invoica** (x402 payments) | `maxPaymentUsdc` in MandateScope maps directly to x402 payment caps |
| **Kognai** (constitutional swarm) | PACT mandates enforce the Five Laws across agent-to-agent delegation |
| **OpenClaw / ClaWHub** | Install via `.openclaw` plugin config; available on ClaWHub |

---

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| **PACT** (this repo) | Agent coordination and trust |
| **LAX** | Latency-aware execution scheduling |
| **SCORE** | Scoring and reputation for agent outputs |
| **AMF** | Agent Message Format |
| **DRS** | Dynamic Resource Scheduling |
| **SOUL** | Constitutional constraints and safety |
| **SIGNAL** | Event bus and pub/sub for agent swarms |

---

## Roadmap

- [x] Mandate schema + signing (v0.2)
- [x] Signature verification + scope check + payment guard (v0.2)
- [x] CoordinationFrame lifecycle (v0.2)
- [x] MandateRegistry with revocation ledger (v0.2)
- [ ] Ed25519 signing (v0.3)
- [ ] EIP-712 typed data support (v0.3)
- [ ] Persistent registry adapter (Supabase / SQLite) (v0.4)
- [ ] Python SDK (v0.5)
- [ ] x402 payment-gated mandate execution (v0.5)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)

Part of the [Godman Protocols](https://github.com/godman-protocols) portfolio.
