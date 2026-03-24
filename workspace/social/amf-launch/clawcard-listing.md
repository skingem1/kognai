# AMF — ClaWHub Listing

**Name:** AMF — Agent Message Format  
**Namespace:** `@godman-protocols/amf`  
**Version:** 0.2.0  
**License:** Apache 2.0  
**Tier:** T2 (infrastructure protocol)  
**Category:** Agent Infrastructure / Messaging  

## Short description (140 chars)
Standard signed envelope format for inter-agent messages. HMAC-SHA256. 5 typed payloads. Transport-agnostic.

## Full description
AMF is an open protocol defining a standard signed envelope for all inter-agent communication. Every message has a sender, recipient, typed payload, and HMAC-SHA256 signature — so agents can verify message authenticity without a centralised auth server, regardless of the underlying transport.

**Key features:**
- `createEnvelope(sender, recipient, payload, secret)` — create a signed envelope
- `verifyEnvelope(envelope, secret)` — verify authenticity (returns bool, never throws)
- Five typed payload builders: `taskRequest`, `taskResult`, `event`, `heartbeat`, `error`
- Broadcast support: `recipient: null` delivers to all subscribers
- Transport-agnostic: works over HTTP, WebSocket, message queues, stdin

**Install:**
```bash
npx skills add https://github.com/godman-protocols/amf
```

## Tags
message-format, envelope, signing, hmac, inter-agent, transport-agnostic, godman-protocols
