# PACT — ClaWHub Marketplace Listing

**Platform:** ClaWHub.com
**Launch date:** April 14, 2026
**Install command:** `npx skills add https://github.com/godman-protocols/pact`

---

## Listing content

**Title:** PACT — Protocol for Agent Coordination and Trust

**Category:** Infrastructure / Security / Multi-Agent

**Tagline:** Cryptographically signed mandates so agents only do what they're explicitly authorised to do.

**Description:**

PACT is the trust and coordination layer for multi-agent AI systems. When agent A delegates a task to agent B, PACT provides mandate signing, scope verification, revocation, and multi-agent coordination frames — so you always know who authorised what and can revoke it instantly.

**What it gives your agents:**
- Mandate lifecycle: create, hash (SHA-256), sign, revoke, verify
- Scope-based delegation with TTL enforcement
- CoordinationFrame for multi-agent workflows (open, close, abort, addParticipant)
- MandateRegistry with revocation ledger and snapshot support
- Full audit trail on every authorisation decision

**Zero external dependencies.** Node 20+ / Deno 1.40+ / Edge compatible.

**Works with:**
- AMF (PACT mandates travel inside AMF envelopes)
- SOUL (constitution rules gate mandate creation)
- LAX (mandate scope can include latency requirements)
- DRS (resource allocations can be bounded by mandate TTL)
- Kognai OpenClaw Skills Registry

**Install:**
```
npx skills add https://github.com/godman-protocols/pact
```

**Links:**
- GitHub: github.com/godman-protocols/pact
- Docs: godman-protocols.dev/pact
- API reference: github.com/godman-protocols/pact/blob/main/docs/api.md
- License: Apache 2.0

**Tags:** trust, coordination, mandate, signing, delegation, revocation, multi-agent, security, TypeScript

---

## ClaWHub submission checklist

- [ ] GitHub repo public (April 14)
- [x] README complete (Sprint 965)
- [x] API docs complete (Sprint 965 — docs/api.md, 243 lines)
- [x] `.openclaw` config present (Sprint 954)
- [x] `.claude-plugin` config present (Sprint 954)
- [x] `.cursor-plugin` config present (Sprint 954)
- [x] `.codex` config present (Sprint 954)
- [x] X thread drafted (Sprint 966)
- [x] ClaWHub listing drafted (Sprint 995)
- [ ] ClaWHub listing submitted (April 14 — human action)
