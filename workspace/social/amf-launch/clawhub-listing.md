# AMF — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/amf`

---

## Listing content

**Title:** AMF — Agent Message Format Protocol

**Category:** Infrastructure / Messaging / Interop

**Tagline:** Signed envelopes with typed payloads — prove who sent what.

**Description:**

AMF is an open protocol for structured agent-to-agent messaging — a signed envelope format with 5 typed payloads (task-request, task-result, event, heartbeat, error), so every message between agents is verifiable, routable, and machine-readable.

**What it gives your agents:**
- Signed envelope with sender, recipient (or null for broadcast), timestamp
- 5 typed payload builders (taskRequest, taskResult, event, heartbeat, error)
- Two-layer HMAC-SHA256 signing (SHA-256 hash of fields + HMAC of hash)
- Envelope verification in one function call

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- PACT (mandate delegation carried as AMF task-request payloads)
- SIGNAL (events wrapped in AMF envelopes for cross-runtime delivery)
- LAX (routing decisions embedded as AMF envelope metadata)

**Install:**
```
npx skills add https://github.com/godman-protocols/amf
```

**Links:**
- GitHub: github.com/godman-protocols/amf
- Docs: godman-protocols.dev/amf
- License: Apache 2.0

**Tags:** messaging, envelope, signing, interop, wire-format, multi-agent, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 974)
- [x] API docs complete (Sprint 974)
- [x] `.openclaw` config present (Sprint 955)
- [x] `.claude-plugin` config present (Sprint 955)
- [x] `.cursor-plugin` config present (Sprint 955)
- [x] `.codex` config present (Sprint 955)
- [x] X thread drafted (Sprint 976)
- [ ] ClaWHub listing submitted (April 14 — human action)
