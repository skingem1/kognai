# AMF — X Launch Thread
**Account:** @invoica_ai
**Date:** April 14, 2026
**Format:** 6-tweet thread

---

## Tweet 1 — Hook

Your AI agents talk to each other in unstructured JSON. You can't prove who sent what.

We just open-sourced the missing wire format.

AMF — Agent Message Format. Thread:

---

## Tweet 2 — The problem

Agent-to-agent messages are ad-hoc. Every agent parses differently. There's no sender verification. Broadcast-only, no addressing.

You're building critical infrastructure on post-it notes.

---

## Tweet 3 — What AMF does

AMF is a signed envelope with 5 typed payloads:

→ task-request: delegate work
→ task-result: report outcomes
→ event: notify state changes
→ heartbeat: health monitoring
→ error: report failures

Two-layer signature: SHA-256 hash + HMAC-SHA256.

---

## Tweet 4 — The code

```typescript
const envelope = createEnvelope(
  'harvey', 'messi',
  taskRequest('task-1', 'Write validator', input),
  SECRET
);
const valid = verifyEnvelope(envelope, SECRET);
// → true

// Broadcast to all agents
createEnvelope('messi', null, heartbeat('alive', 0.3), SECRET);
```

---

## Tweet 5 — Composability

AMF is the wire format for the entire Godman stack:

→ PACT mandates travel as AMF task-request payloads
→ SIGNAL events wrap in AMF envelopes for cross-runtime delivery
→ LAX routing decisions embedded as envelope metadata
→ SOUL evaluations logged with AMF audit envelopes

---

## Tweet 6 — CTA

AMF is protocol 4 of 7 from Godman Protocols.

5 payload types. Two-layer signing. Broadcast + unicast.

GitHub: github.com/godman-protocols/amf
ClaWHub: [ClaWHub link]

All 7 protocols ship April 14.

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 178 | ✓ |
| 2 | 176 | ✓ |
| 3 | 239 | ✓ |
| 4 | 228 | ✓ |
| 5 | 244 | ✓ |
| 6 | 171 | ✓ |

## Notes
- Tweet 4 code — consider image.
- Post April 14, staggered with other threads.
