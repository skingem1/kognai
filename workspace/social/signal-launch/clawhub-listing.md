# SIGNAL — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/signal`

---

## Listing content

**Title:** SIGNAL — Event Bus for Agent Swarms

**Category:** Infrastructure / Messaging / Events

**Tagline:** Stop polling. Start subscribing. Glob-matched events with delivery receipts.

**Description:**

SIGNAL is an open protocol for real-time event delivery between AI agents — with glob-based topic matching, idempotency deduplication, and delivery receipts, so your swarm stays coordinated without polling.

**What it gives your agents:**
- EventBus with glob topic matching (`task.*`, `mandate.**`)
- Idempotency deduplication — same event published twice is a no-op
- Delivery receipts with status (processed, failed, duplicate-skipped)
- Two delivery modes: at-least-once (default) and at-most-once

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- PACT (mandate lifecycle events)
- SCORE (evaluation completion events)
- DRS (resource allocation events)
- SOUL (kill switch trigger events)

**Install:**
```
npx skills add https://github.com/godman-protocols/signal
```

**Links:**
- GitHub: github.com/godman-protocols/signal
- Docs: godman-protocols.dev/signal
- License: Apache 2.0

**Tags:** events, pub-sub, messaging, event-bus, agent-communication, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 973)
- [x] API docs complete (Sprint 973)
- [x] `.openclaw` config present (Sprint 955)
- [x] `.claude-plugin` config present (Sprint 955)
- [x] `.cursor-plugin` config present (Sprint 955)
- [x] `.codex` config present (Sprint 955)
- [x] X thread drafted (Sprint 975)
- [ ] ClaWHub listing submitted (April 14 — human action)
