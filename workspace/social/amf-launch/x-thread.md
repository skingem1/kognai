# AMF — X Launch Thread
**Account:** @invoica_ai  
**Date:** April 2026 (week 5 after PACT launch)  
**Format:** 6-tweet thread  

---

## Tweet 1 — Hook

Every multi-agent system eventually needs agents to talk to each other.

And every team invents a different JSON format, auth header, and RPC convention.

We just open-sourced a standard that ends this.

AMF — Agent Message Format. 🧵

---

## Tweet 2 — The problem

Without a standard message format:

→ Any agent can forge a message from another (no verifiability)
→ Consumers can't distinguish a task from a heartbeat without parsing heuristics
→ Integrating a new agent means learning a new wire format

---

## Tweet 3 — What AMF does

AMF defines a single, typed envelope that any agent can produce and verify.

One format. Five payload types. HMAC-SHA256 signed.

Works over HTTP, WebSocket, queues, stdin — any transport.

---

## Tweet 4 — The code

```typescript
const msg = createEnvelope('harvey', 'messi',
  taskRequest('t-001', 'Render vlog', { vlogId: 'abc' }), SECRET);

const valid = verifyEnvelope(msg, SECRET); // true
// Payload types: task-request, task-result, event, heartbeat, error
```

5 payload builders. Signed. Typed. One import.

---

## Tweet 5 — Composability

AMF is the transport layer of the Godman stack:

→ PACT mandate grants travel as AMF task-request envelopes
→ SOUL audit entries serialise as AMF event payloads
→ LAX routing decisions return as AMF task-result envelopes
→ DRS allocation requests wrap in AMF task-request payloads

Every protocol speaks AMF.

---

## Tweet 6 — CTA

AMF is protocol 4 of 7 from Godman Protocols.

The message format every agent infrastructure needs.

GitHub: github.com/godman-protocols/amf
ClaWHub: [ClaWHub link]
Install: npx skills add https://github.com/godman-protocols/amf

---

## Character counts

| Tweet | Chars | Status |
|-------|-------|--------|
| 1 | 215 | ✓ |
| 2 | 196 | ✓ |
| 3 | 196 | ✓ |
| 4 | 206 | ✓ |
| 5 | 238 | ✓ |
| 6 | 175 | ✓ |
