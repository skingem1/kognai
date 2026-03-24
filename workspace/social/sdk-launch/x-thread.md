# Godman Protocols SDK — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

You don't want to npm install 7 packages.

We hear you.

npm install @godman-protocols/sdk

One import. All 7 protocols. Thread:

---

## Tweet 2 — What's in the box

```typescript
import {
  Pact,    // mandate + coordination
  Lax,     // latency-aware routing
  Score,   // evaluation + reputation
  Signal,  // event bus
  Soul,    // constitutional engine
  Amf,     // message envelopes
  Drs      // resource scheduling
} from '@godman-protocols/sdk'
```

---

## Tweet 3 — Real workflow in 20 lines

```typescript
const soul = Soul.createConstitution({ rules: [...] })
const pact = Pact.createMandate({ scope: 'data-fetch', ttl: 3600 })
const msg  = Amf.createEnvelope('agent-a', 'agent-b', pact)
const slot = Drs.allocate({ pool: 'llm-tier-1', ttl: 60 })
const route = Lax.routeTask({ budget: 500 })
const result = Score.evaluate({ rubric, output })
Signal.publish('task.completed', { score: result.score })
```

SOUL checks every step. PACT authorises. AMF carries. DRS guards. LAX routes. SCORE grades. SIGNAL notifies.

---

## Tweet 4 — Zero deps

Runtime dependencies: zero.

Node.js crypto only. No axios. No ethers. No framework lock-in.

It's a protocol, not a platform.

---

## Tweet 5 — CLI demo

```bash
npx godman-demo
```

Runs a 7-step live workflow (create constitution → mandate → message → allocate → route → score → notify) with output you can read.

---

## Tweet 6 — CTA

github.com/godman-protocols/sdk

Install it. Run the demo. Read the source.

The protocol layer is open. What you build on it is yours.

---

## Posting notes

- Post as reply to Suite Megathread Tweet 6 (SDK section)
- Also post as standalone thread linked from SDK GitHub README
